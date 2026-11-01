// GENERATED from the FY2027 Approved Capital Budget and FY2027–32 Capital Requests PDFs.
// Every project, amount and funding source reconciles to the printed subtotals and totals in those documents.
export interface SeedProject { code: string; department: string; title: string; category: string; requested: Record<string, number>; approved: { fiscalYear: string; amount: number; funding: Record<string, number> } | null; requestStatus: string; notes: string[] }
export const SEED_DEPARTMENTS: { name: string; code: string }[] = [
  {
    "name": "Cable TV",
    "code": "CTV"
  },
  {
    "name": "Public Works - Highway",
    "code": "HWY"
  },
  {
    "name": "Information Technology",
    "code": "ITD"
  },
  {
    "name": "Planning & Community Development",
    "code": "PCD"
  },
  {
    "name": "Police Department",
    "code": "POL"
  },
  {
    "name": "Fire Department",
    "code": "FIR"
  },
  {
    "name": "Sutton Public Schools",
    "code": "SCH"
  },
  {
    "name": "Public Works - Sewer",
    "code": "SWR"
  }
];
export const SEED_PROJECTS: SeedProject[] = [
 {
  "code": "CIP-CTV-001",
  "department": "Cable TV",
  "title": "Town Hall – Meeting Room Enhancements",
  "category": "Technology",
  "requested": {
   "2027": 28312.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 30000.0,
   "funding": {
    "free_cash": 30000.0
   }
  },
  "notes": [
   "FY2027 request was $28,312; approved at $30,000."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-HWY-001",
  "department": "Public Works - Highway",
  "title": "Replace H8 2016 Mack Dump/Plow/Spreader",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 400000.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-002",
  "department": "Public Works - Highway",
  "title": "Replace H16",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 400000.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-003",
  "department": "Public Works - Highway",
  "title": "Replace H7 2017 Mack Dump / Plow / Spreader",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 400000.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-004",
  "department": "Public Works - Highway",
  "title": "Replace H9",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 375000.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-005",
  "department": "Public Works - Highway",
  "title": "H10 Replacement (Dump/Plow/Spreader)",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 370000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 370000.0,
   "funding": {
    "cap_stab": 370000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-HWY-006",
  "department": "Public Works - Highway",
  "title": "Replace H6 2000 Freightliner FL70 Catch Basin",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 365000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-HWY-007",
  "department": "Public Works - Highway",
  "title": "Replace H44",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 325000.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-008",
  "department": "Public Works - Highway",
  "title": "Roadside Mower Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 195000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 195000.0,
   "funding": {
    "cap_stab": 195000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-HWY-009",
  "department": "Public Works - Highway",
  "title": "Consultant fee for dams",
  "category": "Planning & Studies",
  "requested": {
   "2027": 30000.0,
   "2028": 30000.0,
   "2029": 30000.0,
   "2030": 30000.0,
   "2031": 30000.0,
   "2032": 30000.0
  },
  "approved": null,
  "notes": [
   "FY2027 portion not funded; outer-year requests remain."
  ],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-010",
  "department": "Public Works - Highway",
  "title": "Install ground speed spreader controls",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 140000.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-011",
  "department": "Public Works - Highway",
  "title": "Replace M3",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 110000.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-012",
  "department": "Public Works - Highway",
  "title": "Replace H14",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 110000.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-013",
  "department": "Public Works - Highway",
  "title": "Annual Tree Removal",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 100000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 150000.0,
   "funding": {
    "free_cash": 150000.0
   }
  },
  "notes": [
   "FY2027 request was $100,000; approved at $150,000."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-HWY-015",
  "department": "Public Works - Highway",
  "title": "Replace Cemetery Pickup",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 85000.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-016",
  "department": "Public Works - Highway",
  "title": "Replace H18",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 85000.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-017",
  "department": "Public Works - Highway",
  "title": "Replace H2",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 85000.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-018",
  "department": "Public Works - Highway",
  "title": "Roof repair for Cemetery Garage",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 50000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-HWY-014",
  "department": "Public Works - Highway",
  "title": "Replace Cemetery Mower (FY2028)",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 22000.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-HWY-020",
  "department": "Public Works - Highway",
  "title": "Cemetery Mower Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 21000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 21000.0,
   "funding": {
    "other_funds": 21000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-HWY-019",
  "department": "Public Works - Highway",
  "title": "New stand on leaf blower for cemetery",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 18000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-ITD-001",
  "department": "Information Technology",
  "title": "IT – Municipal PC Replacement Program",
  "category": "Technology",
  "requested": {
   "2027": 25000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 25000.0,
   "funding": {
    "free_cash": 25000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-ITD-002",
  "department": "Information Technology",
  "title": "IT – Municipal Security System Upgrade (Cameras)",
  "category": "Technology",
  "requested": {
   "2027": 24000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 25000.0,
   "funding": {
    "free_cash": 25000.0
   }
  },
  "notes": [
   "FY2027 request was $24,000; approved at $25,000."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-ITD-003",
  "department": "Information Technology",
  "title": "IT – Town/PD Firewall Upgrade",
  "category": "Technology",
  "requested": {
   "2027": 22000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 22000.0,
   "funding": {
    "free_cash": 22000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-PCD-001",
  "department": "Planning & Community Development",
  "title": "Steven's Pond Dam - Arch Rebuild",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 40000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-PCD-002",
  "department": "Planning & Community Development",
  "title": "Zoning Bylaw Revamp and Bylaw Recodification",
  "category": "Planning & Studies",
  "requested": {
   "2027": 35000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-PCD-003",
  "department": "Planning & Community Development",
  "title": "Marion's Camp Well Rehab",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 20000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-POL-001",
  "department": "Police Department",
  "title": "Police Cruiser Routine Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 150000.0,
   "2028": 195000.0,
   "2029": 150000.0,
   "2030": 155000.0,
   "2031": 200000.0,
   "2032": 155000.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 150000.0,
   "funding": {
    "free_cash": 150000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-POL-002",
  "department": "Police Department",
  "title": "Security Camera Replacement",
  "category": "Technology",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 25000.0,
   "2030": 25000.0,
   "2031": 25000.0,
   "2032": 25000.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-POL-003",
  "department": "Police Department",
  "title": "Communication System / Generators",
  "category": "Technology",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 60000.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-POL-004",
  "department": "Police Department",
  "title": "Weapon System Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 30000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 30000.0,
   "funding": {
    "free_cash": 30000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-POL-005",
  "department": "Police Department",
  "title": "Repower Police Boat",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 15000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 15000.0,
   "funding": {
    "free_cash": 15000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-FIR-001",
  "department": "Fire Department",
  "title": "Station 2 Parking Lot Replacement",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 310000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-FIR-002",
  "department": "Fire Department",
  "title": "Command Staff Radio Replacement",
  "category": "Technology",
  "requested": {
   "2027": 20000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 20000.0,
   "funding": {
    "free_cash": 20000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-FIR-003",
  "department": "Fire Department",
  "title": "Heavy Duty Tow Vehicle",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 175000.0,
   "funding": {
    "free_cash": 175000.0
   }
  },
  "notes": [
   "Originally requested for FY2028; advanced and funded in FY2027."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-FIR-004",
  "department": "Fire Department",
  "title": "Fire Department Headquarters - Feasibility Study, Planning & Design",
  "category": "Planning & Studies",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 1500000.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-FIR-005",
  "department": "Fire Department",
  "title": "Fire Department Headquarters Construction",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 30000000.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-FIR-006",
  "department": "Fire Department",
  "title": "Engine 1 Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 1400000.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-FIR-007",
  "department": "Fire Department",
  "title": "Car 1 Replacement",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 0.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 120000.0
  },
  "approved": null,
  "notes": [],
  "requestStatus": "submitted"
 },
 {
  "code": "CIP-SCH-001",
  "department": "Sutton Public Schools",
  "title": "HVAC – Engineering Study, Implementation and RTU Phase Monitor",
  "category": "Planning & Studies",
  "requested": {
   "2027": 160000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 160000.0,
   "funding": {
    "free_cash": 160000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-002",
  "department": "Sutton Public Schools",
  "title": "Sewer Feasibility Study",
  "category": "Planning & Studies",
  "requested": {
   "2027": 100000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 100000.0,
   "funding": {
    "cap_stab": 100000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-003",
  "department": "Sutton Public Schools",
  "title": "Multi-Gig Switches",
  "category": "Technology",
  "requested": {
   "2027": 80000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 80000.0,
   "funding": {
    "free_cash": 80000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-004",
  "department": "Sutton Public Schools",
  "title": "Facilities Truck and Plow",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 70000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 70000.0,
   "funding": {
    "free_cash": 70000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-005",
  "department": "Sutton Public Schools",
  "title": "Generator Hookup Elem",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 60000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 60000.0,
   "funding": {
    "free_cash": 60000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-006",
  "department": "Sutton Public Schools",
  "title": "Well #5 Tie-In to WWTP",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 58000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 30000.0,
   "funding": {
    "free_cash": 30000.0
   }
  },
  "notes": [
   "FY2027 request was $58,000; approved at $30,000."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-007",
  "department": "Sutton Public Schools",
  "title": "Four-Season Tractor with Mower Deck and Blower",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 52000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 52000.0,
   "funding": {
    "free_cash": 52000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-008",
  "department": "Sutton Public Schools",
  "title": "Roofing repair",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 50000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-SCH-009",
  "department": "Sutton Public Schools",
  "title": "Fence Along Wood Line of Elementary Playground",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 49000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 50000.0,
   "funding": {
    "free_cash": 50000.0
   }
  },
  "notes": [
   "FY2027 request was $49,000; approved at $50,000."
  ],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-010",
  "department": "Sutton Public Schools",
  "title": "Remaining Carpeting in ELC and Elem",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 33000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 33000.0,
   "funding": {
    "free_cash": 33000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-011",
  "department": "Sutton Public Schools",
  "title": "Wastewater Pump 2 – Jockey Pumps",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 28000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 28000.0,
   "funding": {
    "free_cash": 28000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-012",
  "department": "Sutton Public Schools",
  "title": "Ch 5 Repeater",
  "category": "Technology",
  "requested": {
   "2027": 25000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-SCH-013",
  "department": "Sutton Public Schools",
  "title": "School Firewall/Network Upgrade (End of Life 7/26)",
  "category": "Technology",
  "requested": {
   "2027": 20000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 20000.0,
   "funding": {
    "free_cash": 20000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-014",
  "department": "Sutton Public Schools",
  "title": "Floor scrubbers",
  "category": "Vehicles & Equipment",
  "requested": {
   "2027": 18000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-SCH-015",
  "department": "Sutton Public Schools",
  "title": "Water Tank Cleaning/Inspection",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 18000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 18000.0,
   "funding": {
    "free_cash": 18000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-016",
  "department": "Sutton Public Schools",
  "title": "Elem/ELC Fiber Backbone",
  "category": "Technology",
  "requested": {
   "2027": 16000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 16000.0,
   "funding": {
    "free_cash": 16000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-017",
  "department": "Sutton Public Schools",
  "title": "Field Maintenance, Seeding, etc.",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 13000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 13000.0,
   "funding": {
    "free_cash": 13000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 },
 {
  "code": "CIP-SCH-018",
  "department": "Sutton Public Schools",
  "title": "10 x 20 building",
  "category": "Buildings & Facilities",
  "requested": {
   "2027": 10000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": null,
  "notes": [
   "Requested for FY2027 but not funded. Revise to request in a future year."
  ],
  "requestStatus": "not_funded"
 },
 {
  "code": "CIP-SWR-001",
  "department": "Public Works - Sewer",
  "title": "PLC Upgrade – Phase 2",
  "category": "Infrastructure & Utilities",
  "requested": {
   "2027": 55000.0,
   "2028": 0.0,
   "2029": 0.0,
   "2030": 0.0,
   "2031": 0.0,
   "2032": 0.0
  },
  "approved": {
   "fiscalYear": "2027",
   "amount": 55000.0,
   "funding": {
    "ent_retained": 55000.0
   }
  },
  "notes": [],
  "requestStatus": "approved"
 }
];
export const SEED_REVIEW_NOTES: string[] = [
 "CIP-FIR-003 Heavy Duty Tow Vehicle: requested FY2028 but funded in FY2027 — the FY2028 request was cleared so it isn't counted twice.",
 "CIP-SCH-009: the approved line 'Fence along wood line of elementary playground' ($50,000) was matched to the request 'Fence / Driveway gate' ($49,000). The $50,000 also equals the request 'Roofing repair' — please confirm the match."
];
