/**
 * Customizable homepage text for each OpenBook installation.
 * Stored as JSON in Town.siteText. Falls back to defaults if not set.
 * Any community can edit these from Admin → Settings → Homepage Text.
 *
 * DESIGN PRINCIPLE: defaults use "{townName}" only for proper nouns
 * (section titles, trust band). All body copy is community-neutral.
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
  budgetSectionTitle: string;
  // budgetSectionBody is derived from live data — not stored here

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
    // Hero — accent line uses town name; body copy is generic
    heroHeadline: "A Clearer View",
    heroAccent: `of ${townName}'s`,
    heroSuffix: "Finances.",
    heroSubtext: "OpenBook makes the municipal budget, revenues, expenditures, and capital investments understandable and accessible to every resident.",
    heroCtaPrimary: `Explore FY${currentYear} Budget`,
    heroCtaSecondary: "See Capital Projects",

    // Follow the Dollar — fully generic
    followTitle: "Follow Every Dollar",
    followSubtext: "Every dollar the Town spends follows a path — from residents to services. Here's how it works.",
    followStep1Title: "Revenue comes in",
    followStep1Body: "Property taxes, state aid, fees, and excise taxes fund the Town's operations.",
    followStep2Title: "The budget is set",
    followStep2Body: "Town leadership adopts a balanced budget each year, allocating funds to every department and service.",
    followStep3Title: "Services are delivered",
    followStep3Body: "Schools, public safety, roads, and other essential services reach residents across all function areas.",
    followStep4Title: "The future is built",
    followStep4Body: "Capital funds invest in roads, facilities, equipment, and infrastructure that will serve the community for decades.",

    // Budget section — title uses town name, body is generic
    budgetSectionTitle: `Where ${townName} Invests`,

    // Balance — generic
    balanceSubtext: "The operating budget is balanced — revenue collected equals services funded.",

    // Capital — title uses town name, body is generic
    capitalTitle: `Building ${townName}'s Future`,
    capitalBody: "The capital plan funds long-term assets that serve residents for decades — roads, public safety equipment, facilities, technology, and infrastructure improvements.",

    // Documents — generic
    docsTitle: "Everything Behind the Numbers.",
    docsSubtext: "Every document, every detail — open to all residents.",

    // Trust band — body uses town name as it's a direct address
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
