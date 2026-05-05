"use client";

import { useState, useRef, useEffect, useId } from "react";

interface TooltipIconProps {
  text: string;
  label?: string;
}

export default function TooltipIcon({ text, label }: TooltipIconProps) {
  const [open, setOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-describedby={tooltipId}
        aria-label={label ? `More info about ${label}` : "More info"}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        ?
      </button>
      {open && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg w-max min-w-[14rem] max-w-sm whitespace-normal leading-relaxed"
        >
          {text}
          <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-px">
            <div className="border-4 border-transparent border-r-gray-900" />
          </div>
        </div>
      )}
    </span>
  );
}
