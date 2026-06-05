import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanRows } from "@/lib/parser";
import { normalizeRows, stripZeroAmountRows } from "@/lib/normalizer";
import { parseAccountCodeConfig } from "@/lib/account-codes";
import type { ColumnMappingInput } from "@/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uploadId, mappings, rawData } = body as {
      uploadId: string;
      mappings: ColumnMappingInput[];
      rawData: Record<string, string>[];
    };

    if (!uploadId || !mappings || !rawData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }

    // Load town's account code config (if configured)
    const town = await prisma.town.findUnique({ where: { id: upload.townId } });
    const accountCodeConfig = parseAccountCodeConfig(town?.accountCodeRules || "");

    // Save column mappings
    for (const m of mappings) {
      if (m.targetField === "skip") continue;
      await prisma.columnMapping.upsert({
        where: {
          townId_dataCategory_sourceColumn: {
            townId: upload.townId,
            dataCategory: upload.dataCategory,
            sourceColumn: m.sourceColumn,
          },
        },
        update: { targetField: m.targetField, confirmed: true, confidence: 1.0 },
        create: {
          townId: upload.townId,
          dataCategory: upload.dataCategory,
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
          confirmed: true,
          confidence: 1.0,
        },
      });
    }

    // Clean and normalize rows, applying account code config for auto-categorization
    const cleanedData = cleanRows({
      headers: Object.keys(rawData[0] || {}),
      rows: rawData,
    }).rows;

    const normalized = stripZeroAmountRows(
      normalizeRows(cleanedData, mappings, accountCodeConfig, upload.dataCategory)
    );

    // Delete existing rows for this upload
    await prisma.budgetRow.deleteMany({ where: { uploadId } });

    if (normalized.length > 0) {
      const incomingYears = [...new Set(normalized.map((r) => r.fiscalYear))];
      await prisma.budgetRow.deleteMany({
        where: {
          townId: upload.townId,
          dataCategory: upload.dataCategory,
          fiscalYear: { in: incomingYears },
          uploadId: { not: uploadId },
        },
      });

      await prisma.budgetRow.createMany({
        data: normalized.map((row) => ({
          townId: upload.townId,
          uploadId,
          dataCategory: upload.dataCategory,
          ...row,
        })),
      });
    }

    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "mapped", rowCount: normalized.length },
    });

    await prisma.town.update({
      where: { id: upload.townId },
      data: { published: true },
    });

    return NextResponse.json({
      success: true,
      rowsCreated: normalized.length,
      townSlug: town?.slug,
    });
  } catch (err) {
    console.error("Mapping error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
