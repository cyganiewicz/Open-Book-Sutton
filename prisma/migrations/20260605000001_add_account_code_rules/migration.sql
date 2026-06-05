-- AlterTable: add accountCodeRules JSON storage to Town
ALTER TABLE "Town" ADD COLUMN "accountCodeRules" TEXT NOT NULL DEFAULT '';
