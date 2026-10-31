// Privacy + cleanup helpers for the Open Checkbook.
//
// Philosophy: the system is DEFAULT-DENY for anything it cannot confidently
// identify as a business. Rules here only ever make things safer or flag them
// for a human; nothing in this file publishes a person's name.

// ── Vendor classification ────────────────────────────────────────────────────

const BUSINESS_WORDS = new Set(`
INC LLC LLP LTD LP CO CORP CORPORATION COMPANY COMPANIES ASSOC ASSOCIATES ASSOCIATION ASSN
SERVICE SERVICES SVS SVC SUPPLY SUPPLIES SYSTEM SYSTEMS SOLUTIONS SOFTWARE TECH TECHNOLOGY TECHNOLOGIES
COMMUNICATIONS COMM WIRELESS CABLE ELECTRIC ELECTRICAL ENERGY POWER SOLAR GRID GAS OIL FUEL PETROLEUM
WATER SEWER PLUMBING HEATING HVAC MECHANICAL CONTROLS LOGIC AUTOMOTIVE AUTO TIRE TRUCK EQUIPMENT RENTALS
TOOL TOOLS HARDWARE LUMBER PAVING CONSTRUCTION CONTRACTING CONTRACTORS BUILDERS REBUILDERS BUILDING
ENGINEERING ENGINEERS CONSULTING CONSULTANTS ENVIRONMENTAL DISPOSAL WASTE RECYCLING SECURITY ALARM FIRE
INSURANCE INS MUTUAL BANK TRUST LEASE LEASING FINANCIAL CAPITAL GROUP ENTERPRISES INDUSTRIES PRODUCTS
MATERIALS MARKET STORE SHOP DEPOT CENTER CENTRE GARDEN FARM FARMS NURSERY LANDSCAPING LAWN TREE PEST
LABORATORY LABS LAB MEDICAL HEALTH HEALTHCARE PHARMACY DRUG CLINIC HOSPITAL SCHOOL SCHOOLS ACADEMY
COLLEGE UNIVERSITY EDUCATION EDUCATIONAL LEARNING READING PUBLISHING PUBLISHERS PRESS PRINT PRINTING
BOOKS LIBRARY NEWS MEDIA ADVERTISING MARKETING SPORT SPORTS ATHLETIC RECREATION PARK COMMITTEE COUNCIL
DISTRICT DEPT DEPARTMENT TOWN CITY COUNTY STATE COMMONWEALTH FEDERAL REGIONAL VALLEY NATIONAL AMERICAN
UNITED GLOBAL INTERNATIONAL MASS MASSACHUSETTS ENGLAND CENTRAL TREASURER RETIREMENT BOARD FOUNDATION
CHILDREN CHILDRENS SCIENCE ART ARTS MUSIC DATA INFORMATION INNOVATIONS INNOVATION HUB WEATHER ELEVATOR
ELEVATORS ROOFING FLOORING PAINTING DOOR DOORS WINDOW WINDOWS FENCE FENCING SIGN SIGNS GRAPHICS DESIGN
DIGITAL NETWORK NETWORKS INTERNET TELEPHONE TELECOM CELLULAR MOBILE MAINTENANCE REPAIR REPAIRS CLEANING
CLEANERS JANITORIAL UNIFORM UNIFORMS LAUNDRY PRINTERS COPY COPIERS OFFICE PAPER PIZZA RESTAURANT CAFE
DINER BAKERY CATERING FOODS FOOD BEVERAGE BRANDS BOTTLING POLAR LODGE CAMP OUTDOOR GOPHER BLICK STAPLES
AMAZON WALMART TARGET LOWES DELL APPLE GOOGLE VERIZON UNIFIRST EVERSOURCE CHARTER COMCAST CONVERGINT
OTIS SAVVAS PITNEY BOWES SCHEIN CDW MIIA ICMA MASC MAAO MSAA NASSP CMRPC IBA IPS UMASS HOLDINGS
SPECIALTIES SPECIALTY PARTNERS PARTNERSHIP INSTITUTE SOCIETY LEAGUE CLUB UNION FEDERATION PROGRAM
PROGRAMS PROG AGENCY AUTHORITY COMMISSION COLLABORATIVE COLLAB CONSORTIUM VILLAGE HOMES HOME
`.split(/\s+/).filter(Boolean));

export interface VendorClassification {
  /** "business" = confident enough to auto-publish the name; "review" = a person decides */
  kind: "business" | "review";
  /** Our best guess, shown to the reviewer */
  suggested: "business" | "individual" | "unsure";
  reason: string;
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function tokens(name: string): string[] {
  return normalizeWhitespace(name).toUpperCase().split(/[\s,/]+/).map(t => t.replace(/[^A-Z0-9'&.\-]/g, "")).filter(Boolean);
}

export function classifyVendor(rawName: string): VendorClassification {
  const name = normalizeWhitespace(rawName);
  const toks = tokens(name);

  const hasBusinessWord = toks.some(t => BUSINESS_WORDS.has(t.replace(/[.'\-&]/g, "")));
  const hasDigit = /\d/.test(name);
  const hasAmpOrSlash = /[&/]/.test(name);
  const hasDotAbbrev =
    /\b[A-Z]\.[A-Z]\./i.test(name) || /\.(COM|NET|ORG|INC|LLC|CORP|CO)\b/i.test(name);
  const hasPossessive = /\b[A-Z]{2,}'S\b/i.test(name);
  const manyWords = toks.length >= 4;

  // A business word can also be someone's surname ("PARK, JOHN", "JOHN CHURCH"), so a first name
  // next to it sends the vendor to a person instead of being auto-approved.
  const cleanedForPerson = name.replace(/[,;]+$/g, "").trim();
  const commaPerson = /^[A-Za-z'\-]+,\s*[A-Za-z'\-.]+(\s+[A-Za-z'\-.]+)?$/.test(cleanedForPerson) &&
    FIRST_NAMES.has((cleanedForPerson.split(",")[1] || "").trim().split(/\s+/)[0].toLowerCase());
  const twoWordPerson = toks.length === 2 && FIRST_NAMES.has(toks[0].toLowerCase().replace(/[^a-z]/g, ""));
  if (hasBusinessWord && (commaPerson || twoWordPerson)) {
    return { kind: "review", suggested: commaPerson ? "individual" : "unsure", reason: "Looks like a person's name that includes a business-type word" };
  }

  if (hasBusinessWord) return { kind: "business", suggested: "business", reason: "Name contains a business term" };
  if (hasDigit || hasAmpOrSlash || hasDotAbbrev || hasPossessive || manyWords) {
    return { kind: "business", suggested: "business", reason: "Name format looks like an organization" };
  }

  // Everything below is NOT auto-approved: a person decides.
  const cleaned = name.replace(/[,;]+$/g, "").trim();
  const words = cleaned.split(/[\s,]+/).filter(Boolean);
  const commaName = /^[A-Za-z'\-]+,\s*[A-Za-z'\-.]+(\s+[A-Za-z'\-.]+)?$/.test(cleaned);
  const initialName = /^[A-Za-z]\.\s*[A-Za-z'\-]{3,}/.test(cleaned);
  const firstNameHit = words.some(w => FIRST_NAMES.has(w.toLowerCase().replace(/[^a-z]/g, "")));
  if (commaName || initialName || firstNameHit) {
    return { kind: "review", suggested: "individual", reason: "Looks like a person's name" };
  }
  if (words.length === 1) {
    return { kind: "review", suggested: "business", reason: "Single word – likely an organization or brand" };
  }
  return { kind: "review", suggested: "unsure", reason: "Could be a person or a small business" };
}

// ── Display-name cleanup ─────────────────────────────────────────────────────

const KEEP_UPPER = new Set(`
LLC LLP LP CDW MIIA MASC MAAO ICMA MSAA NASSP CMRPC IBA IPS UMASS DPW HVAC PDQ ACE IT US USA MA NE BV
CLIA WWTP UPS EOE NAPA AAA ADP PC TV ID II III IV HS MS ELC IBM HP BJS BJ NH RI CT VT PO
`.split(/\s+/).filter(Boolean));
const LOWER_WORDS = new Set(["AND", "OF", "THE", "FOR", "AT", "IN", "ON", "BY", "TO", "OR", "A", "AN"]);

/** "CDW GOVERNMENT, INC." → "CDW Government, Inc."  (admins can still override per vendor) */
export function smartCase(rawName: string): string {
  const name = normalizeWhitespace(rawName).replace(/[\s,;\-]+$/, "");
  return name.replace(/[A-Za-z][A-Za-z']*/g, (word, offset: number) => {
    const upper = word.toUpperCase();
    if (KEEP_UPPER.has(upper)) return upper;
    if (word.length <= 3 && !/[AEIOUY]/.test(upper)) return upper; // DPW, BV, WB
    if (offset > 0 && LOWER_WORDS.has(upper)) return word.toLowerCase();
    let t = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    // O'Rouke, D'Angelo
    t = t.replace(/^([A-Z])'([a-z])/, (_m, a: string, b: string) => `${a}'${b.toUpperCase()}`);
    return t;
  });
}

// ── Memo sanitizing ──────────────────────────────────────────────────────────

export interface SanitizeOptions {
  redactStreetNumbers: boolean;
}

export interface SanitizedMemo {
  text: string | null;
  /** What we automatically removed, for the admin's information */
  redactions: string[];
}

const STREET_SUFFIX =
  "(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Ln|Lane|Ct|Court|Way|Blvd|Boulevard|Cir|Circle|Pl|Place|Pkwy|Parkway|Hwy|Highway|Tpk|Turnpike|Ter|Terrace)";

export function sanitizeMemo(raw: string | null | undefined, opts: SanitizeOptions): SanitizedMemo {
  let t = normalizeWhitespace(raw ?? "");
  const redactions: string[] = [];
  if (!t) return { text: null, redactions };

  // A memo that is only a number (e.g. a repeated voucher id) tells the public nothing
  if (/^[\d\s\-#]+$/.test(t) && (t.match(/\d/g) || []).length >= 4) {
    return { text: null, redactions: ["number-only memo removed"] };
  }

  const sub = (re: RegExp, replacement: string, label: string) => {
    const before = t;
    t = t.replace(re, replacement);
    if (t !== before) redactions.push(label);
  };

  sub(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]", "email");
  sub(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted]", "SSN-like number");
  sub(/(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}(?!\d)/g, "[phone]", "phone number");
  sub(/\b(?:REG|PLATE|TAG|LIC(?:ENSE)?)\s*#?\s*:?\s*[A-Z0-9]{4,8}\b/gi, "[plate]", "license plate");
  sub(/\b(?:ACCT|ACCOUNT|ACC)\b\.?\s*(?:#|NO\.?|NUMBER)?\s*:?\s*(?=[A-Z0-9\-]*\d)[A-Z0-9][A-Z0-9\-]{4,}/gi, "ACCT [redacted]", "account number");
  sub(/\b\d{9,}\b/g, "[number]", "long number");
  if (opts.redactStreetNumbers) {
    sub(
      new RegExp(`\\b\\d{1,5}\\s+(?=[A-Za-z.]+(?:\\s+[A-Za-z.]+){0,2}\\s+${STREET_SUFFIX}\\b)`, "gi"),
      "",
      "street number"
    );
  }

  t = normalizeWhitespace(t);
  return { text: t || null, redactions };
}

// ── Personal-name detection in memos ─────────────────────────────────────────
// Heuristic, deliberately over-eager: a false positive only means a person
// glances at the memo; a false negative could publish a name.

const FIRST_NAMES = new Set(`
james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony
donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob
gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander patrick
raymond dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle walter ethan jeremy
harold keith christian roger noah gerald carl terry sean austin arthur lawrence jesse dylan bryan joe jordan
billy bruce albert willie gabriel logan alan juan wayne roy ralph randy eugene vincent russell elijah louis
bobby philip johnny bradley derek derrick marc marcus martin howard fred stanley jon darren todd shawn
chad craig glenn dean brent cory travis troy tony mike matt chris dan dave steve jim tom tim jeff greg
rob rick bob ken kurt neil leo ian evan owen luke mitchell mitch curtis victor ernest earl clarence
leonard norman allen barry bernard calvin clifford clinton dale darryl duane edwin gordon herbert jay lloyd
melvin nelson oscar rodney ronnie sam stuart theodore warren
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret sandra
ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca sharon laura
cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha katherine christine
debra rachel carolyn janet catherine maria heather diane olivia julie joyce victoria kelly christina lauren
joan evelyn judith megan andrea cheryl hannah jacqueline martha gloria teresa ann sara madison frances
kathryn janice jean abigail alice judy sophia denise amber doris marilyn danielle beverly isabella theresa
diana natalie brittany charlotte marie kayla alexis lori kristen kristin kristy erin erica jill tina tracy
tammy wendy stacy stacey leah caitlin margot patty peggy sally sheila sherry suzanne tara tiffany
vanessa vicki virginia yvonne bonnie carla connie crystal debbie dianne eileen ellen gail holly irene
jane janis joanne kay lynn lorraine maureen nora paula penny rita robin ruth stella tanya valerie
`.split(/\s+/).filter(Boolean));

const NON_NAME_SECOND = new Set(`
rd road st street ave avenue dr drive ln lane ct court way blvd cir pl pkwy hwy tpk school schools pole dept
department fire police town hall library park hill pond lake river center plaza building garage shed lodge camp
field farm elementary middle high church cemetery water electric gas services service supply supplies company
inc llc corp club association committee board fund trust bank union fest festival day week month year meeting
meetings conference annual membership dues renewal renewals subscription license licenses permit inspection
repair maintenance install installation supplies equipment program programs project fy
`.split(/\s+/).filter(Boolean));

const HONORIFIC = /\b(?:Mr|Mrs|Ms|Miss|Dr|Officer|Sgt|Sergeant|Lt|Lieutenant|Capt|Captain|Det|Detective|Chief)\.?\s+[A-Z][a-z]+/g;

export interface NameDetection {
  names: string[];
  /** Memo with each detected name replaced by [name] */
  redacted: string;
}

export function detectNames(text: string | null | undefined, safePhrases: string[] = []): NameDetection {
  const memo = text ?? "";
  if (!memo.trim()) return { names: [], redacted: memo };

  const spans: { start: number; end: number }[] = [];
  const add = (start: number, end: number) => {
    if (!spans.some(s => start < s.end && end > s.start)) spans.push({ start, end });
  };

  // a) Initial + surname:  A.Niedzwiecki, H. Golden
  for (const m of memo.matchAll(/(?<![A-Za-z.])[A-Z]\.\s?[A-Za-z]{3,}/g)) {
    add(m.index!, m.index! + m[0].length);
  }
  // b) Honorific + name
  for (const m of memo.matchAll(HONORIFIC)) add(m.index!, m.index! + m[0].length);

  // c) Known first name followed by a capitalized word;  "Last, First"
  const words = [...memo.matchAll(/[A-Za-z]+(?:['\-][A-Za-z]+)*/g)].map(m => ({
    text: m[0], start: m.index!, end: m.index! + m[0].length,
  }));
  const isCap = (w: string) => /^[A-Z]/.test(w);
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    const between = memo.slice(a.end, b.start);
    if (FIRST_NAMES.has(a.text.toLowerCase()) && isCap(a.text) && isCap(b.text) &&
        /^\s$/.test(between) && b.text.length >= 2 && !NON_NAME_SECOND.has(b.text.toLowerCase())) {
      add(a.start, b.end);
    }
    // "Couture, John"
    if (/^\s*,\s*$/.test(between) && FIRST_NAMES.has(b.text.toLowerCase()) && isCap(a.text) && isCap(b.text) &&
        !NON_NAME_SECOND.has(a.text.toLowerCase())) {
      add(a.start, b.end);
    }
  }

  // Drop anything the town has told us is a place/organization, not a person
  const lowerMemo = memo.toLowerCase();
  for (const phrase of safePhrases) {
    const needle = phrase.toLowerCase().trim();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = lowerMemo.indexOf(needle, from);
      if (at === -1) break;
      for (let i = spans.length - 1; i >= 0; i--) {
        if (spans[i].start < at + needle.length && spans[i].end > at) spans.splice(i, 1);
      }
      from = at + needle.length;
    }
  }

  if (!spans.length) return { names: [], redacted: memo };
  spans.sort((x, y) => x.start - y.start);
  const names = spans.map(s => memo.slice(s.start, s.end));
  let redacted = "";
  let cursor = 0;
  for (const s of spans) {
    redacted += memo.slice(cursor, s.start) + "[name]";
    cursor = s.end;
  }
  redacted += memo.slice(cursor);
  return { names, redacted };
}
