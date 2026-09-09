import type { PartDStage } from "./stage.ts";

export interface SeedMember {
  id: number;
  displayName: string;
  email: string;
  contractId: string;
  planId: string;
  planYear: number;
  effectiveDate: string;
  assignedProvider: string;
  assignedSpecialty: string;
  /** Read from this plan's Evidence of Coverage, not from one constant. D-081. */
  drugDeductible: number;
  outOfPocketLimit: number;
  accumulators: {
    oopMaxLimit: number;
    oopMaxUsedYtd: number;
    drugSpendYtd: number;
    dental: [limit: number, remaining: number];
    otc: [limit: number, remaining: number];
    hearing: [limit: number, remaining: number];
    vision: [limit: number, remaining: number];
  };
  claims: {
    id: string;
    serviceDate: string;
    provider: string;
    serviceDescription: string;
    billed: number;
    planPaid: number;
    memberOwes: number;
    status: "received" | "processing" | "paid" | "denied";
  }[];
  priorAuthorizations: {
    id: string;
    requestedService: string;
    requestedDate: string;
    status: "submitted" | "in_review" | "approved" | "denied";
    decisionDate: string | null;
  }[];
  appointments: { id: string; visitDate: string; provider: string; specialty: string }[];
}

/**
 * Five invented members. D-047: no real member data at any version.
 *
 * Addresses are the one thing not written here. OPERATOR_MEMBER_EMAILS carries
 * five real ones in member-id order so a code can be received and the login
 * demonstrated; CLAUDE.md forbids personal data in the repo, so the fallbacks
 * below are unreachable and the variable lives only in .env.
 *
 * Every provider name reuses the DEMO DATA roster from src/corpus/synthetic.ts,
 * so no real practice is named anywhere in this file.
 *
 * All five sit on H5141-004 or H5141-007, the two plans whose Part D deductible
 * the corpus actually states. H8010-002 does not state one in its converted
 * Evidence of Coverage, and inventing it would break CLAUDE.md rule 6.
 *
 * Each record answers at least four question types: what a claim cost, where a
 * prior authorisation stands, how much of an allowance is left, and who the
 * assigned provider is. FR-P2-25.
 */
export const SEED_MEMBERS: SeedMember[] = [
  {
    id: 1,
    displayName: "Demo Member One",
    email: "member1@example.invalid",
    contractId: "H5141",
    planId: "004",
    planYear: 2026,
    effectiveDate: "2026-01-01",
    assignedProvider: "Dr. Example Alvarez",
    assignedSpecialty: "Primary Care",
    drugDeductible: 150,
    outOfPocketLimit: 2_100,
    accumulators: {
      oopMaxLimit: 9_250,
      oopMaxUsedYtd: 1_240.5,
      drugSpendYtd: 95,
      dental: [2_000, 1_450],
      otc: [480, 275],
      hearing: [1_000, 1_000],
      vision: [300, 130],
    },
    claims: [
      {
        id: "CLM-0031",
        serviceDate: "2026-08-12",
        provider: "Dr. Example Chen",
        serviceDescription: "Dermatology office visit",
        billed: 210,
        planPaid: 200,
        memberOwes: 10,
        status: "paid",
      },
    ],
    priorAuthorizations: [
      {
        id: "PA-0114",
        requestedService: "MRI, lower back",
        requestedDate: "2026-08-28",
        status: "in_review",
        decisionDate: null,
      },
    ],
    appointments: [
      { id: "APT-0210", visitDate: "2026-08-12", provider: "Dr. Example Chen", specialty: "Dermatology" },
    ],
  },
  {
    id: 2,
    displayName: "Demo Member Two",
    email: "member2@example.invalid",
    contractId: "H5141",
    planId: "007",
    planYear: 2026,
    effectiveDate: "2026-01-01",
    assignedProvider: "Dr. Example Farrell",
    assignedSpecialty: "Primary Care",
    drugDeductible: 220,
    outOfPocketLimit: 2_100,
    accumulators: {
      oopMaxLimit: 9_250,
      oopMaxUsedYtd: 640,
      drugSpendYtd: 210,
      dental: [2_000, 2_000],
      otc: [480, 400],
      hearing: [1_000, 500],
      vision: [300, 300],
    },
    claims: [
      {
        id: "CLM-0042",
        serviceDate: "2026-07-03",
        provider: "Dr. Example Brennan",
        serviceDescription: "Cardiology consultation",
        billed: 380,
        planPaid: 378,
        memberOwes: 2,
        status: "paid",
      },
    ],
    priorAuthorizations: [
      {
        id: "PA-0127",
        requestedService: "Sleep study, at home",
        requestedDate: "2026-06-19",
        status: "approved",
        decisionDate: "2026-06-27",
      },
    ],
    appointments: [
      { id: "APT-0233", visitDate: "2026-07-03", provider: "Dr. Example Brennan", specialty: "Cardiology" },
    ],
  },
  {
    id: 3,
    displayName: "Demo Member Three",
    email: "member3@example.invalid",
    contractId: "H5141",
    planId: "004",
    planYear: 2026,
    effectiveDate: "2026-02-01",
    assignedProvider: "Dr. Example Kowalski",
    assignedSpecialty: "Primary Care",
    drugDeductible: 150,
    outOfPocketLimit: 2_100,
    accumulators: {
      oopMaxLimit: 9_250,
      oopMaxUsedYtd: 3_980.25,
      drugSpendYtd: 2_460,
      dental: [2_000, 0],
      otc: [480, 60],
      hearing: [1_000, 0],
      vision: [300, 45],
    },
    claims: [
      {
        id: "CLM-0058",
        serviceDate: "2026-08-30",
        provider: "Dr. Example Haddad",
        serviceDescription: "Orthopedic surgery follow-up",
        billed: 1_450,
        planPaid: 1_100,
        memberOwes: 350,
        status: "processing",
      },
    ],
    priorAuthorizations: [
      {
        id: "PA-0140",
        requestedService: "Physical therapy, 12 sessions",
        requestedDate: "2026-08-02",
        status: "denied",
        decisionDate: "2026-08-15",
      },
    ],
    appointments: [
      { id: "APT-0261", visitDate: "2026-08-30", provider: "Dr. Example Haddad", specialty: "Orthopedics" },
    ],
  },
  {
    id: 4,
    displayName: "Demo Member Four",
    email: "member4@example.invalid",
    contractId: "H5141",
    planId: "007",
    planYear: 2026,
    effectiveDate: "2026-01-01",
    assignedProvider: "Dr. Example Alvarez",
    assignedSpecialty: "Primary Care",
    drugDeductible: 220,
    outOfPocketLimit: 2_100,
    accumulators: {
      oopMaxLimit: 9_250,
      oopMaxUsedYtd: 120,
      drugSpendYtd: 0,
      dental: [2_000, 1_925],
      otc: [480, 480],
      hearing: [1_000, 1_000],
      vision: [300, 300],
    },
    claims: [
      {
        id: "CLM-0063",
        serviceDate: "2026-05-21",
        provider: "Dr. Example Jensen",
        serviceDescription: "Routine eye exam",
        billed: 145,
        planPaid: 145,
        memberOwes: 0,
        status: "paid",
      },
    ],
    priorAuthorizations: [
      {
        id: "PA-0151",
        requestedService: "Hearing aid fitting",
        requestedDate: "2026-09-01",
        status: "submitted",
        decisionDate: null,
      },
    ],
    appointments: [
      { id: "APT-0288", visitDate: "2026-05-21", provider: "Dr. Example Jensen", specialty: "Ophthalmology" },
    ],
  },
  {
    id: 5,
    displayName: "Demo Member Five",
    email: "member5@example.invalid",
    contractId: "H5141",
    planId: "004",
    planYear: 2026,
    effectiveDate: "2026-03-01",
    assignedProvider: "Dr. Example Farrell",
    assignedSpecialty: "Primary Care",
    drugDeductible: 150,
    outOfPocketLimit: 2_100,
    accumulators: {
      oopMaxLimit: 9_250,
      oopMaxUsedYtd: 2_015.75,
      drugSpendYtd: 640,
      dental: [2_000, 800],
      otc: [480, 180],
      hearing: [1_000, 250],
      vision: [300, 0],
    },
    claims: [
      {
        id: "CLM-0077",
        serviceDate: "2026-09-02",
        provider: "Dr. Example Duarte",
        serviceDescription: "Endocrinology office visit",
        billed: 265,
        planPaid: 255,
        memberOwes: 10,
        status: "received",
      },
    ],
    priorAuthorizations: [
      {
        id: "PA-0166",
        requestedService: "Continuous glucose monitor",
        requestedDate: "2026-08-20",
        status: "in_review",
        decisionDate: null,
      },
    ],
    appointments: [
      { id: "APT-0301", visitDate: "2026-09-02", provider: "Dr. Example Duarte", specialty: "Endocrinology" },
    ],
  },
];

/**
 * The address a code is sent to, from the environment when set. Unset means the
 * @example.invalid fallback stands and nothing can be delivered.
 */
export function memberEmail(member: SeedMember): string {
  const configured = (process.env["OPERATOR_MEMBER_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return configured[member.id - 1] ?? member.email;
}

/** Every stage the derivation can produce, so the demo covers all three. */
export const seededStages = (stageOf: (member: SeedMember) => PartDStage): Set<PartDStage> =>
  new Set(SEED_MEMBERS.map(stageOf));
