import { existsSync, readFileSync } from "node:fs";
import { parseCatalog, parseCounties, selectPlanDocuments } from "./discover.ts";
import { fetchDocuments, isPathAllowed } from "./fetch.ts";
import { extractHtmlText, meetsByteFloor, pdfPageCount, pdfToBbox, pdfToPlanColumn, pdfToText } from "./convert.ts";
import { buildSyntheticProviderDirectory } from "./synthetic.ts";
import { CORPUS_SCOPE } from "./scope.ts";
import { renderReport } from "./report.ts";
import {
  catalogPath,
  documentsPath,
  latestSnapshotId,
  bboxPath,
  markdownPath,
  mergeEntries,
  newSnapshotId,
  rawPath,
  readDocuments,
  readSnapshot,
  writeFile,
  writeJson,
  writeManifest,
} from "./snapshot.ts";
import type { ManifestEntry, SourceDocument } from "./types.ts";

const ORIGIN = "https://www.cloverhealth.com";
const UA = "clovbot-casestudy/0.1 (Clover Health interview case study; contact via repository)";
const DELAY_MS = 1_500;

const { countyId: COUNTY_ID, zipcode: ZIPCODE, planYear: PLAN_YEAR } = CORPUS_SCOPE;
const { stateAbbrev: STATE, countyName: COUNTY_NAME } = CORPUS_SCOPE;

/** Public prose pages. includes corporate and investor-relations content. */
const CORPORATE_PAGES = [
  "/about-us/about-clover",
  // /about-us/investors redirects off-domain to an external IR host that does not
  // respond; out of scope, since the corpus is cloverhealth.com public content.
  "/about-us/press",
  "/about-us/leadership",
  "/understanding-medicare/medicare-faq",
  "/understanding-medicare/insurance-term-faq",
  "/members/supplemental-benefits",
] as const;

/** Documents the catalog does not carry, matched by filename once resolved. */
const FILER_DOCUMENTS = [
  { kind: "formulary", pattern: /formulary_ch_nj/i },
  { kind: "pharmacy_directory", pattern: /pharmacy_directory_nj/i },
] as const;

const get = async (url: string): Promise<Response> =>
  fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function discover(): Promise<void> {
  const id = newSnapshotId(new Date());

  const counties = parseCounties(await (await get(`${ORIGIN}/api/zipcode/counties?zipcode=${ZIPCODE}`)).json());
  const county = counties.find((c) => c.fipsCountyId === COUNTY_ID);
  if (county === undefined) throw new Error(`zipcode ${ZIPCODE} did not resolve to county ${COUNTY_ID}`);

  const raw = await (await get(`${ORIGIN}/api/plans/document-search?county_id=${COUNTY_ID}&year=${PLAN_YEAR}`)).json();
  const plans = parseCatalog(raw, { planYear: PLAN_YEAR, stateAbbrev: STATE });

  const documents: SourceDocument[] = CORPUS_SCOPE.plans.flatMap((ref) =>
    selectPlanDocuments(plans, ref),
  );

  documents.push(...(await discoverFilerDocuments()));
  documents.push(
    ...CORPORATE_PAGES.map((path) => ({
      id: `corporate${path.replace(/\//g, "-")}`,
      kind: "corporate" as const,
      url: `${ORIGIN}${path}`,
      contractId: "",
      planId: "",
      planYear: PLAN_YEAR,
      language: "english" as const,
    })),
  );

  // The Summary of Benefits is one URL serving both plans; fetch it once.
  const unique = [...new Map(documents.map((d) => [d.id, d])).values()];

  writeJson(catalogPath(id), raw);
  writeJson(documentsPath(id), unique);
  console.log(`snapshot ${id}: ${unique.length} documents discovered`);
}

/** Pages carrying /filer/file/ links to documents the catalog does not list. */
const FILER_PAGES = ["/members/formulary", "/members/plan-documents"] as const;

/** Resolve /filer/file/<id>/<n>/ links to their CDN targets and match by filename. */
async function discoverFilerDocuments(): Promise<SourceDocument[]> {
  const pages = await Promise.all(FILER_PAGES.map(async (path) => (await get(`${ORIGIN}${path}`)).text()));
  const links = [...new Set(pages.flatMap((html) => html.match(/\/filer\/file\/\d+\/\d+\//g) ?? []))];
  const found: SourceDocument[] = [];

  for (const link of links) {
    if (found.length === FILER_DOCUMENTS.length) break;
    await sleep(500);
    const response = await fetch(`${ORIGIN}${link}`, { headers: { "user-agent": UA }, redirect: "manual" });
    const target = response.headers.get("location");
    if (target === null) continue;

    for (const { kind, pattern } of FILER_DOCUMENTS) {
      if (!pattern.test(target) || found.some((d) => d.kind === kind)) continue;
      found.push({
        id: `${PLAN_YEAR}-${kind}`,
        kind,
        url: target,
        contractId: "",
        planId: "",
        planYear: PLAN_YEAR,
        language: "english",
      });
    }
  }
  for (const { kind } of FILER_DOCUMENTS) {
    if (!found.some((d) => d.kind === kind)) console.warn(`warning: ${kind} not found on ${FILER_PAGES.join(", ")}`);
  }
  return found;
}

async function fetchAll(): Promise<void> {
  const id = latestSnapshotId();
  const documents = readDocuments(id);
  const robotsTxt = await (await get(`${ORIGIN}/robots.txt`)).text();

  const results = await fetchDocuments(documents, {
    fetcher: async (url) => {
      const response = await get(url);
      if (!response.ok) return { status: response.status, bytes: null, reason: response.statusText };
      return { status: 200, bytes: new Uint8Array(await response.arrayBuffer()), reason: null };
    },
    delayMs: DELAY_MS,
    now: () => new Date().toISOString(),
    sleep,
    robotsAllowed: isPathAllowed(robotsTxt, "/"),
  });

  for (const { entry, bytes } of results) {
    if (bytes === null) continue;
    writeFile(rawPath(id, entry.documentId, entry.kind === "corporate" ? "html" : "pdf"), bytes);
  }

  writeManifest({
    id,
    createdAt: new Date().toISOString(),
    countyId: COUNTY_ID,
    planYear: PLAN_YEAR,
    plans: CORPUS_SCOPE.plans,
    entries: results.map((r) => r.entry),
  });
  report(results.map((r) => r.entry));
}

function convertAll(): void {
  const id = latestSnapshotId();
  const snapshot = readSnapshot(id);
  const updated: ManifestEntry[] = [];

  for (const entry of snapshot.entries) {
    const isHtml = entry.kind === "corporate";
    const source = rawPath(id, entry.documentId, isHtml ? "html" : "pdf");
    // A conversion failure is retried when the file is still there. Skipping it
    // made a fixed parser report the stale reason from the run that broke.
    if (entry.status !== "ok" && !(entry.status === "failed" && existsSync(source))) {
      updated.push(entry);
      continue;
    }
    if (!existsSync(source)) {
      updated.push({ ...entry, status: "failed", failureReason: `missing raw file ${source}` });
      continue;
    }

    try {
      const retried: ManifestEntry = { ...entry, status: "ok", failureReason: null };
      // One Summary of Benefits PDF serves both plans, and each plan has its own
      // entry, so each converts to its own column.
      const text = isHtml
        ? extractHtmlText(readFileSync(source, "utf8"))
        : entry.kind === "summary_of_benefits"
          ? pdfToPlanColumn(source, entry.planId)
          : pdfToText(source);
      writeFile(markdownPath(id, entry.documentId), text);
      // The formulary's tiers are a table, and typed extraction needs coordinates.
      if (entry.kind === "formulary") writeFile(bboxPath(id, entry.documentId), pdfToBbox(source));

      const convertedBytes = Buffer.byteLength(text, "utf8");
      updated.push({
        ...retried,
        pages: isHtml ? null : pdfPageCount(source),
        convertedBytes,
        ...(meetsByteFloor(entry.kind, convertedBytes)
          ? {}
          : { status: "failed" as const, failureReason: `converted to ${convertedBytes} bytes, below floor` }),
      });
    } catch (error) {
      updated.push({
        ...entry,
        status: "failed",
        failureReason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const ref of CORPUS_SCOPE.plans) {
    const synthetic = buildSyntheticProviderDirectory({
      ...ref,
      countyName: COUNTY_NAME,
    });
    writeFile(markdownPath(id, synthetic.entry.documentId), synthetic.markdown);
    updated.push(synthetic.entry);
  }

  const entries = mergeEntries(snapshot.entries, updated);
  writeManifest({ ...snapshot, entries });
  report(entries);
}

function report(entries: ManifestEntry[]): void {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  console.log([...counts].map(([status, n]) => `${status}: ${n}`).join("  "));
  for (const entry of entries) {
    if (entry.failureReason !== null && entry.status !== "synthetic") {
      console.log(`  ${entry.status} ${entry.documentId}: ${entry.failureReason}`);
    }
  }
}

function writeReport(): void {
  const snapshot = readSnapshot(latestSnapshotId());
  writeFile("docs/corpus-report.md", renderReport(snapshot));
  console.log(`wrote docs/corpus-report.md for snapshot ${snapshot.id}`);
}

const command = process.argv[2];
const commands: Record<string, () => void | Promise<void>> = {
  discover,
  fetch: fetchAll,
  convert: convertAll,
  report: writeReport,
};

const run = commands[command ?? ""];
if (run === undefined) {
  console.error(`usage: corpus <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}
await run();
