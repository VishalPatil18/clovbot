import type { ManifestEntry } from "./types.ts";

export const SYNTHETIC_BANNER =
  "> DEMO DATA. This provider directory is invented for demonstration and describes " +
  "no real doctor, practice, address or phone number. Clover does not publish a " +
  "downloadable provider directory; the real one is a live search tool. Nothing here " +
  "is a statement about Clover's actual network.\n";

interface SyntheticScope {
  contractId: string;
  planId: string;
  planYear: number;
  countyName: string;
}

export interface SyntheticDocument {
  entry: ManifestEntry;
  markdown: string;
}

/** Fixed roster, so rebuilding does not churn the snapshot hash. */
const PROVIDERS = [
  ["Dr. Example Alvarez", "Primary Care", "Sample Family Medicine", "201-555-0101"],
  ["Dr. Example Brennan", "Cardiology", "Demo Heart Associates", "201-555-0102"],
  ["Dr. Example Chen", "Dermatology", "Sample Skin Clinic", "201-555-0103"],
  ["Dr. Example Duarte", "Endocrinology", "Demo Diabetes Center", "201-555-0104"],
  ["Dr. Example Farrell", "Primary Care", "Sample Internal Medicine", "201-555-0105"],
  ["Dr. Example Gupta", "Gastroenterology", "Demo Digestive Health", "201-555-0106"],
  ["Dr. Example Haddad", "Orthopedics", "Sample Bone and Joint", "201-555-0107"],
  ["Dr. Example Ivanov", "Neurology", "Demo Neurology Partners", "201-555-0108"],
  ["Dr. Example Jensen", "Ophthalmology", "Sample Eye Care", "201-555-0109"],
  ["Dr. Example Kowalski", "Primary Care", "Demo Community Practice", "201-555-0110"],
] as const;

export function buildSyntheticProviderDirectory(scope: SyntheticScope): SyntheticDocument {
  const rows = PROVIDERS.map(
    ([name, specialty, practice, phone]) =>
      `| ${name} | ${specialty} | ${practice} | ${scope.countyName} | ${phone} | DEMO DATA |`,
  );

  const markdown = [
    SYNTHETIC_BANNER,
    `# Provider Directory (DEMO DATA) - ${scope.contractId}-${scope.planId}, ${scope.planYear}`,
    "",
    `Service area: ${scope.countyName}, New Jersey.`,
    "",
    "| Provider | Specialty | Practice | County | Phone | Source |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    SYNTHETIC_BANNER,
  ].join("\n");

  return {
    markdown,
    entry: {
      documentId: `${scope.contractId}-${scope.planId}-${scope.planYear}-provider_directory`,
      kind: "provider_directory",
      contractId: scope.contractId,
      planId: scope.planId,
      status: "synthetic",
      url: "",
      retrievedAt: new Date(0).toISOString(),
      robotsAllowed: true,
      bytes: null,
      pages: null,
      sha256: null,
      convertedBytes: Buffer.byteLength(markdown, "utf8"),
      failureReason:
        "Clover does not publish a downloadable provider directory; this is synthetic demo data",
    },
  };
}
