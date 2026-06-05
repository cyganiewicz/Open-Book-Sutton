"use client";

import type { SummaryTile } from "@/types";
import TooltipIcon from "./TooltipIcon";

interface TooltipMap {
  [key: string]: string;
}

export default function SummaryTiles({
  tiles,
  tooltips = {},
  townColor,
}: {
  tiles: SummaryTile[];
  tooltips?: TooltipMap;
  townColor?: string;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((tile, i) => {
        const isHero = i === 0;
        return (
          <div
            key={tile.label}
            className={`rounded-xl border p-4 sm:p-5 transition-all duration-150 ${
              isHero
                ? "text-white border-transparent shadow-md"
                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
            }`}
            style={isHero && townColor ? { backgroundColor: townColor } : undefined}
          >
            <p
              className={`text-xs sm:text-sm font-medium leading-tight ${
                isHero ? "text-white/75" : "text-gray-500"
              }`}
            >
              {tile.label}
              {tooltips[tile.label] && (
                <TooltipIcon
                  text={tooltips[tile.label]}
                  label={tile.label}
                  light={isHero}
                />
              )}
            </p>
            <p
              className={`text-xl sm:text-2xl font-semibold mt-1.5 tracking-tight tabular-nums ${
                isHero ? "text-white" : "text-gray-900"
              }`}
            >
              {tile.value}
            </p>
            {tile.change && (
              <p
                className={`text-xs sm:text-sm mt-1 tabular-nums font-medium ${
                  isHero
                    ? "text-white/70"
                    : tile.changeType === "positive"
                    ? "text-emerald-600"
                    : tile.changeType === "negative"
                    ? "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {tile.change}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
