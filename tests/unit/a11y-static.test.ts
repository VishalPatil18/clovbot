import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static half of the accessibility floor. axe, Playwright and Lighthouse were
 * approved but deferred to P3, so these assert what can be checked without a
 * browser: type scale, target size, focus visibility, and the two interaction
 * rules NFR-A11Y-05 names. They do not replace a browser scan, and the criteria
 * needing one are recorded as unverified in claude/features.md.
 */
const css = ["web/src/tokens.css", "web/src/app.css"]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith(".tsx")
        ? [join(dir, entry.name)]
        : [],
  );

const tsx = sourceFiles("web/src")
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

/** Comments explain the rules; only shipped markup should be asserted against. */
const markup = tsx.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIN_TEXT_PX = 18;
const MIN_TARGET_PX = 44;

/**
 * D-042 narrowed NFR-A11Y-03's 18px floor to the reading surface: the member's
 * question and the assistant's answer. Interface chrome uses the DESIGN.md scale.
 * These assertions check that split holds rather than that everything is 18px.
 */
const token = (name: string): number =>
  Number(new RegExp(`--${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(css)?.[1]);

const rule = (selector: string): string =>
  new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`, "s").exec(css)?.[1] ?? "";

describe("reading surface type scale [NFR-A11Y-03, D-042]", () => {
  it("sets the message size at 18px or above", () => {
    expect(token("text-message")).toBeGreaterThanOrEqual(MIN_TEXT_PX);
  });

  it("applies it to the question, the answer and the pending line", () => {
    for (const selector of [".turn__question", ".turn__answer p", ".turn__pending"]) {
      expect(rule(selector)).toMatch(/font-size:\s*var\(--text-message\)/);
    }
  });

  it("applies it to the starter questions, which are questions about to be asked", () => {
    expect(rule(".starter")).toMatch(/font-size:\s*var\(--text-message\)/);
  });

  // Below 16px, iOS zooms the page when the field takes focus.
  it("keeps the composer input at 16px or above", () => {
    expect(token("text-input")).toBeGreaterThanOrEqual(16);
    expect(rule(".composer__input")).toMatch(/font-size:\s*var\(--text-input\)/);
  });

  // The mock set this at 11px: the smallest type on the screen, on the surface
  // the product's trustworthiness rests on. It sits at UI body size instead.
  it("keeps the citation above the mock's 11px chip", () => {
    expect(token("text-cite")).toBeGreaterThanOrEqual(14);
  });

  it("gives answer text a readable measure", () => {
    expect(rule(".turn__answer p")).toMatch(/max-width:\s*\d+ch/);
  });

  it("leaves interface chrome on the DESIGN.md scale", () => {
    expect(token("text-body")).toBe(14);
    expect(token("text-heading-sm")).toBe(23);
    expect(token("text-heading")).toBe(40);
  });
});

describe("target size [NFR-A11Y-02]", () => {
  it("sets the shared minimum to the AAA 44px, not the AA 24px", () => {
    const target = /--target-min:\s*(\d+)px/.exec(css)?.[1];
    expect(Number(target)).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it("applies that minimum to buttons and link buttons globally", () => {
    expect(css).toMatch(/button,\s*a\[role="button"\][^{]*\{[^}]*min-height:\s*var\(--target-min\)/);
  });

  it("gives the composer input and starter buttons the same minimum", () => {
    expect(css).toMatch(/\.composer__input\s*\{[^}]*min-height:\s*var\(--target-min\)/s);
    expect(css).toMatch(/\.starter\s*\{[^}]*min-height:\s*var\(--target-min\)/s);
  });
});

describe("focus indication [NFR-A11Y-04]", () => {
  it("defines a focus ring of at least 2px", () => {
    const width = /--focus-ring:\s*(\d+)px/.exec(css)?.[1];
    expect(Number(width)).toBeGreaterThanOrEqual(2);
  });

  it("applies it to every focusable element", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring\)/s);
  });

  it("never removes the outline", () => {
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it("offers a skip link to main content", () => {
    expect(css).toMatch(/\.skip-link/);
    expect(tsx).toMatch(/Skip to main content/);
  });
});

describe("interaction rules [NFR-A11Y-05]", () => {
  it("uses no hamburger in primary navigation", () => {
    expect(markup).not.toMatch(/hamburger|menu-toggle|☰/i);
    expect(markup).toMatch(/aria-label="Primary"/);
  });

  // Hover may enhance, never carry meaning or reveal a control.
  it("declares no hover rule that reveals or hides content", () => {
    const hoverBlocks = [...css.matchAll(/:hover\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    for (const block of hoverBlocks) {
      expect(block).not.toMatch(/display:|visibility:|opacity:\s*1\b/);
    }
  });

  it("honours reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

describe("required surfaces", () => {
  // FR-13: a route to a human visible in every state, including mid-stream. The
  // assistant carries the named control; the host page replicates Clover's own
  // call affordances, which serve the same purpose under different wording.
  it("keeps the named control in the assistant, where mid-stream visibility matters", () => {
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant).toMatch(/Talk to a person/);
  });

  it("gives the host page a visible call path", () => {
    const landing = readFileSync("web/src/components/Landing.tsx", "utf8");
    const telLinks = landing.match(/href=\{`tel:/g) ?? [];
    expect(telLinks.length).toBeGreaterThanOrEqual(3);
    expect(landing).toMatch(/Call Us/);
    expect(landing).toMatch(/Request a Call/);
  });

  it("renders the scope disclosure [FR-15]", () => {
    expect(tsx).toMatch(/not a clinician/i);
    expect(tsx).toMatch(/never decides\s+coverage/i);
  });

  it("renders the unaffiliated case-study notice [FR-30]", () => {
    expect(tsx).toMatch(/Unaffiliated case study/i);
  });

  it("states that no member data is held [NFR-SEC-01]", () => {
    expect(tsx).toMatch(/no member data/i);
  });

  it("offers between four and six starter questions [FR-14]", () => {
    const starters = tsx.match(/driver:\s*"A-\d\d"/g) ?? [];
    expect(starters.length).toBeGreaterThanOrEqual(4);
    expect(starters.length).toBeLessThanOrEqual(6);
  });

  // D-026: an unaffiliated deploy must not publish a routable support line.
  it("never shows the real Clover number", () => {
    expect(tsx).not.toMatch(/1-888-778-1478/);
    expect(tsx).toMatch(/1-555-0100/);
  });

  // FR-30: the notice collapses rather than disappearing, so the page always
  // discloses that it is unaffiliated.
  it("keeps the case-study notice reachable after it is collapsed", () => {
    const landing = readFileSync("web/src/components/Landing.tsx", "utf8");
    expect(landing).toMatch(/cl-notice-chip/);
    expect(landing).toMatch(/Unaffiliated case study\. Read the full notice/);
  });

  it("gives both dismiss controls an accessible name", () => {
    const landing = readFileSync("web/src/components/Landing.tsx", "utf8");
    expect(landing).toMatch(/Collapse the case-study notice/);
    expect(landing).toMatch(/Dismiss the LiveHealthy reward message/);
    // The glyph itself is decorative; the name comes from the hidden text.
    expect(landing).toMatch(/aria-hidden="true">&times;/);
  });

  it("sizes the dismiss controls to the 44px minimum", () => {
    const css = readFileSync("web/src/landing.css", "utf8");
    const block = /\.cl-dismiss\s*\{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(block).toMatch(/width:\s*44px/);
    expect(block).toMatch(/height:\s*44px/);
  });

  // Icons are decoration beside a text label, never the label itself.
  it("hides decorative icons from screen readers", () => {
    const withIcons = ["Assistant", "VoiceComposer", "DictateButton", "CallbackPanel"]
      .map((name) => readFileSync(`web/src/components/${name}.tsx`, "utf8"))
      .join("\n");
    const icons = withIcons.match(/<Io[A-Za-z]+[^>]*>/g) ?? [];
    expect(icons.length).toBeGreaterThan(8);
    for (const icon of icons) expect(icon).toMatch(/aria-hidden="true"/);
  });

  // The two icon-only controls carry their name another way.
  it("names the icon-only controls", () => {
    const dictate = readFileSync("web/src/components/DictateButton.tsx", "utf8");
    expect(dictate).toMatch(/aria-label=\{label\}/);
    const voice = readFileSync("web/src/components/VoiceComposer.tsx", "utf8");
    expect(voice).toMatch(/<span className="visually-hidden">\{spoken\}<\/span>/);
  });

  it("keeps the microphone at the mock's 112px and the dictate control at the target minimum", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    const mic = /\.mic \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(mic).toMatch(/width: 112px/);
    const dictate = /\.dictate \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(dictate).toMatch(/width: var\(--target-min\)/);
  });

  // The rings are decoration; the state is carried by colour, icon and text.
  it("stops the ring animation under reduced motion", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.mic-ring \{ animation: none/);
  });

  // FR-18: a mis-heard word must be fixable before the question is asked.
  it("places a dictated transcript in the composer rather than sending it", () => {
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant).toMatch(/onTranscript=\{\(text\) =>/);
    expect(assistant).toMatch(/setDraft\(\(current\) =>/);
    const dictate = readFileSync("web/src/components/DictateButton.tsx", "utf8");
    expect(dictate).not.toMatch(/onSend|submit\(/);
  });

  it("labels the composer for screen readers", () => {
    expect(tsx).toMatch(/htmlFor="composer-input"/);
  });

  it("marks the conversation as a live region", () => {
    expect(tsx).toMatch(/aria-live="polite"/);
  });
});
