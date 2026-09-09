import type { CatalogPlan, CountyResolution, DocumentKind, Scope, SourceDocument } from "./types.ts";
import { CATALOG_KEY_TO_KIND } from "./types.ts";

/** The state each plan's documents actually belong to, read from the CDN filename. */
const STATE_IN_FILENAME = /_(nj|tx|ga|pa|sc)_/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireString(source: Record<string, unknown>, key: string, context: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context}: expected a non-empty string at "${key}", got ${JSON.stringify(value)}`);
  }
  return value;
}

export function parseCounties(raw: unknown): CountyResolution[] {
  if (!Array.isArray(raw)) {
    throw new Error(`county lookup: expected an array, got ${typeof raw}`);
  }
  if (raw.length === 0) {
    throw new Error("county lookup: no county matched that zipcode");
  }
  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`county lookup: entry ${index} is not an object`);
    }
    const context = `county lookup entry ${index}`;
    return {
      zipcode: requireString(entry, "zipcode", context),
      fipsCountyId: requireString(entry, "fips_county_id", context),
      countyName: requireString(entry, "county_name", context),
      stateAbbrev: requireString(entry, "state_abbrev", context),
    };
  });
}

/** The state a plan's documents belong to, or null when no filename reveals it. */
function planState(documents: Record<string, unknown>): string | null {
  for (const byLanguage of Object.values(documents)) {
    if (!isRecord(byLanguage)) continue;
    for (const url of Object.values(byLanguage)) {
      if (typeof url !== "string") continue;
      const match = STATE_IN_FILENAME.exec(url);
      if (match?.[1] !== undefined) return match[1].toUpperCase();
    }
  }
  return null;
}

export function parseCatalog(raw: unknown, scope: Scope): CatalogPlan[] {
  if (!isRecord(raw) || !Array.isArray(raw["results"])) {
    throw new Error('document search: expected an object with a "results" array');
  }

  const plans = raw["results"].map((entry, index): CatalogPlan => {
    if (!isRecord(entry)) {
      throw new Error(`document search: result ${index} is not an object`);
    }
    const context = `document search result ${index}`;
    const contractId = requireString(entry, "contract_id", context);
    const planId = requireString(entry, "plan_id", context);
    const year = Number(requireString(entry, "year", context));

    if (year !== scope.planYear) {
      throw new Error(
        `document search: ${contractId}-${planId} is plan year ${year}, expected ${scope.planYear}`,
      );
    }
    const documents = entry["documents"];
    if (!isRecord(documents)) {
      throw new Error(`${context}: expected a "documents" object`);
    }
    return {
      contractId,
      planId,
      year,
      name: requireString(entry, "name", context),
      networkType: requireString(entry, "network_type", context),
      rxCoverage: entry["rx_coverage"] === true,
      documents,
    };
  });

  // The endpoint accepts zipcode= and silently ignores it, returning every state.
  const foreign = new Set(
    plans
      .map((plan) => planState(plan.documents))
      .filter((state): state is string => state !== null && state !== scope.stateAbbrev),
  );
  if (foreign.size > 0) {
    throw new Error(
      `document search: response is not county-scoped to ${scope.stateAbbrev}, it also carries ` +
        `${[...foreign].sort().join(", ")}. Pass county_id, not zipcode.`,
    );
  }

  return plans;
}

export function selectPlanDocuments(
  plans: CatalogPlan[],
  selection: { contractId: string; planId: string },
): SourceDocument[] {
  const plan = plans.find(
    (candidate) =>
      candidate.contractId === selection.contractId && candidate.planId === selection.planId,
  );
  if (plan === undefined) {
    throw new Error(
      `plan ${selection.contractId}-${selection.planId} is not in the catalog; ` +
        `available: ${plans.map((p) => `${p.contractId}-${p.planId}`).join(", ")}`,
    );
  }

  const english = plan.documents["english"];
  if (!isRecord(english)) {
    throw new Error(`plan ${plan.contractId}-${plan.planId} has no English documents`);
  }

  const documents: SourceDocument[] = [];
  // Optional: no Spanish formulary or directory is published, so a missing key
  // is a fact about the source. The English set still raises when absent.
  for (const language of ["english", "spanish"] as const) {
    const set = language === "english" ? english : plan.documents["spanish"];
    if (!isRecord(set)) continue;
    for (const [key, kind] of Object.entries(CATALOG_KEY_TO_KIND)) {
      const url = set[key];
      if (typeof url !== "string" || url.length === 0) continue;
      documents.push({
        // The id carries the language, or the Spanish EOC would overwrite the English one.
        id:
          language === "english"
            ? `${plan.contractId}-${plan.planId}-${plan.year}-${kind}`
            : `${plan.contractId}-${plan.planId}-${plan.year}-${kind}-es`,
        kind: kind as DocumentKind,
        url,
        contractId: plan.contractId,
        planId: plan.planId,
        planYear: plan.year,
        language,
      });
    }
  }
  return documents;
}
