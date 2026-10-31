// Checkbook settings: which accounts are sensitive, and how strict to be.
// Stored as JSON in Town.checkbookSettings; falls back to safe defaults.

export type SensitiveAction = "exclude" | "redact" | "hold";

export interface SensitiveRule {
  /** Matched (case-insensitive "contains") against the ACCOUNT DESCRIPTION */
  match: string;
  /**
   * exclude – never published; only counted (e.g. confidential benefit payments)
   * redact  – published with the payee name replaced by `label` and memo removed (e.g. taxpayer refunds)
   * hold    – every payment is held for a person to review before it appears (e.g. salary accounts)
   */
  action: SensitiveAction;
  label?: string;
}

export interface CheckbookSettings {
  sensitiveRules: SensitiveRule[];
  /** Payments to an individual at or above this amount are held for review */
  largeIndividualThreshold: number;
  /** Remove house numbers from street addresses found in memos */
  redactStreetNumbers: boolean;
  /** Phrases that look like names but aren't (e.g. a school or park name); never flagged */
  safePhrases: string[];
}

export const DEFAULT_SETTINGS: CheckbookSettings = {
  sensitiveRules: [
    { match: "EXCISE", action: "redact", label: "Motor vehicle excise refund" },
    { match: "ABATEMENT", action: "redact", label: "Tax abatement refund" },
    { match: "REAL ESTATE TAX", action: "redact", label: "Property tax refund" },
    { match: "PERSONAL PROPERTY", action: "redact", label: "Property tax refund" },
    { match: "REFUND", action: "redact", label: "Refund (payee name withheld)" },
    { match: "VETERANS BENEFITS", action: "exclude" },
    { match: "GENERAL RELIEF", action: "exclude" },
    { match: "WELFARE", action: "exclude" },
    { match: "FUEL ASSISTANCE", action: "exclude" },
    { match: "SALARY", action: "hold" },
    { match: "SALARIES", action: "hold" },
    { match: "WAGES", action: "hold" },
    { match: "PAYROLL", action: "hold" },
    { match: "STIPEND", action: "hold" },
    { match: "OVERTIME", action: "hold" },
    { match: "SEVERANCE", action: "hold" },
    { match: "SETTLEMENT", action: "hold" },
  ],
  largeIndividualThreshold: 10000,
  redactStreetNumbers: true,
  safePhrases: [],
};

export function parseSettings(json: string | null | undefined): CheckbookSettings {
  if (!json || !json.trim()) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(json) as Partial<CheckbookSettings>;
    const rules = Array.isArray(parsed.sensitiveRules)
      ? parsed.sensitiveRules.filter(
          (r): r is SensitiveRule =>
            !!r && typeof r.match === "string" && r.match.trim() !== "" &&
            (r.action === "exclude" || r.action === "redact" || r.action === "hold")
        )
      : DEFAULT_SETTINGS.sensitiveRules;
    return {
      sensitiveRules: rules,
      largeIndividualThreshold:
        typeof parsed.largeIndividualThreshold === "number" && parsed.largeIndividualThreshold >= 0
          ? parsed.largeIndividualThreshold
          : DEFAULT_SETTINGS.largeIndividualThreshold,
      redactStreetNumbers:
        typeof parsed.redactStreetNumbers === "boolean"
          ? parsed.redactStreetNumbers
          : DEFAULT_SETTINGS.redactStreetNumbers,
      safePhrases: Array.isArray(parsed.safePhrases)
        ? parsed.safePhrases.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        : DEFAULT_SETTINGS.safePhrases,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** One rule per line:  KEYWORD | action | optional label */
export function rulesToText(rules: SensitiveRule[]): string {
  return rules.map(r => [r.match, r.action, r.label ?? ""].join(" | ").replace(/ \| $/, "")).join("\n");
}

export function textToRules(text: string): SensitiveRule[] {
  const out: SensitiveRule[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("|").map(p => p.trim());
    if (!parts[0]) continue;
    const action = (parts[1] || "").toLowerCase();
    if (action !== "exclude" && action !== "redact" && action !== "hold") continue;
    out.push({ match: parts[0].toUpperCase(), action, label: parts[2] || undefined });
  }
  return out;
}

const PRIORITY: Record<SensitiveAction, number> = { exclude: 3, redact: 2, hold: 1 };

/** Strongest matching rule wins: exclude > redact > hold */
export function matchSensitiveRule(
  settings: CheckbookSettings,
  ...fields: (string | null | undefined)[]
): SensitiveRule | null {
  const haystack = fields.filter(Boolean).join(" ").toUpperCase();
  if (!haystack) return null;
  let best: SensitiveRule | null = null;
  for (const rule of settings.sensitiveRules) {
    if (haystack.includes(rule.match.toUpperCase())) {
      if (!best || PRIORITY[rule.action] > PRIORITY[best.action]) best = rule;
    }
  }
  return best;
}
