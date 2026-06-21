/**
 * Customizable homepage text for each OpenBook installation.
 * Stored as JSON in Town.siteText. Falls back to defaults if not set.
 * Any community can edit these from Admin → Settings → Homepage Text.
 */
export interface SiteText {
  // Hero
  heroHeadline: string;      // e.g. "A Clearer View"
  heroAccent: string;        // e.g. "of Sutton's" (shown in gold)
  heroSuffix: string;        // e.g. "Finances."
  heroSubtext: string;       // paragraph below headline
  heroCtaPrimary: string;    // "Explore FY2027 Budget"
  heroCtaSecondary: string;  // "See Capital Projects"

  // Follow the Dollar
  followTitle: string;
  followSubtext: string;
  followStep1Title: string; followStep1Body: string;
  followStep2Title: string; followStep2Body: string;
  followStep3Title: string; followStep3Body: string;
  followStep4Title: string; followStep4Body: string;

  // Budget section
  budgetSectionTitle: string;   // "Where [Town] Invests"
  budgetSectionBody: string;    // paragraph about education etc.

  // Balance section
  balanceSubtext: string;

  // Capital section
  capitalTitle: string;
  capitalBody: string;

  // Documents section
  docsTitle: string;
  docsSubtext: string;

  // Footer trust band
  trustHeadline: string;
  trustBody: string;
}

export function defaultSiteText(townName: string, currentYear: string): SiteText {
  return {
    heroHeadline: "A Clearer View",
    heroAccent: `of ${townName}'s`,
    heroSuffix: "Finances.",
    heroSubtext: `OpenBook makes the Town of ${townName}'s budget, revenues, expenditures, and capital investments understandable and accessible to every resident.`,
    heroCtaPrimary: `Explore FY${currentYear} Budget`,
    heroCtaSecondary: "See Capital Projects",

    followTitle: "Follow Every Dollar",
    followSubtext: "Every dollar the Town spends follows a path — from residents to services. Here's how it works.",
    followStep1Title: "Revenue comes in",
    followStep1Body: "Property taxes, state aid, fees, and excise taxes fund the Town's operations.",
    followStep2Title: "The budget is set",
    followStep2Body: "The Select Board and Town Meeting adopt a balanced budget allocating funds to every department.",
    followStep3Title: "Services are delivered",
    followStep3Body: "Schools, public safety, roads, and other services reach residents across all function areas.",
    followStep4Title: "The future is built",
    followStep4Body: "Capital funds invest in roads, facilities, equipment, and infrastructure that will last decades.",

    budgetSectionTitle: `Where ${townName} Invests`,
    budgetSectionBody: `Education represents the largest area of municipal spending, reflecting the community's commitment to ${townName}'s schools and students. Every dollar is appropriated through Town Meeting.`,

    balanceSubtext: `${townName}'s operating budget is balanced — revenue collected equals services funded.`,

    capitalTitle: `Building ${townName}'s Future`,
    capitalBody: `${townName}'s capital plan funds long-term assets that serve residents for decades — roads, public safety equipment, facilities, technology, and infrastructure improvements.`,

    docsTitle: "Everything Behind the Numbers.",
    docsSubtext: "Every document, every detail — open to all residents.",

    trustHeadline: "Built for Residents.",
    trustBody: `OpenBook gives every ${townName} resident direct access to the information behind town financial decisions — clearly, completely, and at no cost.`,
  };
}

export function parseSiteText(raw: string, townName: string, currentYear: string): SiteText {
  const defaults = defaultSiteText(townName, currentYear);
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}
