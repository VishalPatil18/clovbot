/**
 * Renders the app at a set of viewports and writes a PNG for each.
 *
 *   npm run shoot
 *
 * Exists because "responsive" cannot be reviewed from CSS. iPhone 14 Pro is the
 * floor the layout is held to: 393x852 CSS pixels at devicePixelRatio 3.
 */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env["SHOOT_BASE"] ?? "http://localhost:5173";
const OUT = process.env["SHOOT_OUT"] ?? "/tmp/claude-501/shots";

/** The floor, one narrower phone, and a tablet where the two-column layout returns. */
const VIEWPORTS = [
  { name: "iphone14pro", width: 393, height: 852, scale: 3 },
  { name: "iphonese", width: 375, height: 667, scale: 2 },
  { name: "ipadmini", width: 768, height: 1024, scale: 2 },
  // Proves the panel layout above the breakpoint is unchanged.
  { name: "desktop", width: 1440, height: 900, scale: 1 },
] as const;

interface Shot {
  id: string;
  path: string;
  /** Run before capturing: open the panel, switch to voice, and so on. */
  prepare?: (page: import("playwright").Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  { id: "landing", path: "/" },
  {
    id: "assistant",
    path: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /ask the assistant/i }).click();
      await page.waitForTimeout(600);
    },
  },
  {
    id: "voice",
    path: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /ask the assistant/i }).click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /switch to voice|^voice$/i }).click();
      await page.waitForTimeout(400);
    },
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failures = 0;

for (const viewport of VIEWPORTS) {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      ...devices["iPhone 14 Pro"],
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.scale,
      isMobile: viewport.width < 700,
      hasTouch: viewport.width < 700,
    });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text().slice(0, 120));
    });
    try {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 20_000 });
      await shot.prepare?.(page);
      const file = `${OUT}/${viewport.name}-${shot.id}.png`;
      await page.screenshot({ path: file, fullPage: false });

      // The one measurement worth taking every time: a page that scrolls
      // sideways on a phone is broken however good it looks in a screenshot.
      // The root tsconfig has no DOM lib, so this runs as a string in the page.
      const overflow = (await page.evaluate(
        "({ scrollWidth: document.documentElement.scrollWidth," +
          " clientWidth: document.documentElement.clientWidth })",
      )) as { scrollWidth: number; clientWidth: number };
      const bleeds = overflow.scrollWidth > overflow.clientWidth + 1;
      if (bleeds) failures += 1;
      console.log(
        `${viewport.name.padEnd(12)} ${shot.id.padEnd(10)} ` +
          `${bleeds ? `HORIZONTAL OVERFLOW ${String(overflow.scrollWidth)}>${String(overflow.clientWidth)}` : "ok"}` +
          `${problems.length > 0 ? ` | console: ${problems[0] ?? ""}` : ""}`,
      );
    } catch (error) {
      failures += 1;
      console.error(`${viewport.name} ${shot.id} FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
    await context.close();
  }
}

await browser.close();
console.log(`\nwrote to ${OUT}`);
if (failures > 0) process.exit(1);
