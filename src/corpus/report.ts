import { BYTE_FLOORS } from "./convert.ts";
import { formatPlanRef } from "./scope.ts";
import type { FetchStatus, ManifestEntry, Snapshot } from "./types.ts";

const STATUSES: FetchStatus[] = ["ok", "failed", "blocked", "synthetic"];

const belowFloor = (entry: ManifestEntry): boolean =>
  entry.status !== "failed" &&
  entry.status !== "blocked" &&
  entry.convertedBytes !== null &&
  entry.convertedBytes < BYTE_FLOORS[entry.kind];

export function renderReport(snapshot: Snapshot): string {
  const counts = STATUSES.map(
    (status) => `| ${status} | ${snapshot.entries.filter((e) => e.status === status).length} |`,
  );

  const failures = snapshot.entries.filter(
    (e) => e.status === "failed" || e.status === "blocked",
  );
  const undersized = snapshot.entries.filter(belowFloor);

  return [
    "# Corpus retrievability report",
    "",
    `Snapshot \`${snapshot.id}\`, created ${snapshot.createdAt}.`,
    `Scope: ${snapshot.plans.map(formatPlanRef).join(", ")}, ` +
      `plan year ${snapshot.planYear}, county ${snapshot.countyId}.`,
    "",
    "## Status counts",
    "",
    "| Status | Count |",
    "| --- | --- |",
    ...counts,
    "",
    "## Every document attempted",
    "",
    "| Document | Kind | Status | Pages | Raw bytes | Converted bytes | robots |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...snapshot.entries.map(
      (e) =>
        `| ${e.documentId} | ${e.kind} | ${e.status} | ${e.pages ?? "-"} | ` +
        `${e.bytes ?? "-"} | ${e.convertedBytes ?? "-"} | ` +
        `${e.robotsAllowed ? "allowed" : "disallowed"} |`,
    ),
    "",
    "## Failures",
    "",
    ...(failures.length === 0
      ? ["No failures. Every document was retrieved."]
      : failures.map((e) => `- **${e.documentId}** (${e.status}): ${e.failureReason ?? "no reason recorded"}`)),
    "",
    "## Conversions below their byte floor",
    "",
    ...(undersized.length === 0
      ? ["None. Every conversion cleared its floor."]
      : undersized.map(
          (e) =>
            `- **${e.documentId}**: ${e.convertedBytes} bytes, below the ${e.kind} floor ` +
            `of ${BYTE_FLOORS[e.kind]}. Treat as a silent conversion failure.`,
        )),
    "",
  ].join("\n");
}
