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

  // The question moved from the button itself onto its title element when the
  // starters became cards; the 18px floor follows the question. D-042.
  it("applies it to the starter questions, which are questions about to be asked", () => {
    expect(rule(".starter__title")).toMatch(/font-size:\s*var\(--text-message\)/);
  });

  // A card that sends something other than what it shows would be a small lie
  // on a product whose whole claim is that it does not state what it cannot support.
  it("asks exactly the question the card displays", () => {
    expect(markup).toContain("{starter.question}");
    expect(markup).toMatch(/submit\(starter\.question, plan\)/);
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

  // Wrapped by the formatter, so whitespace is normalised before matching.
  it("renders the scope disclosure [FR-15]", () => {
    const flat = tsx.replace(/\s+/g, " ");
    expect(flat).toMatch(/not a clinician/i);
    expect(flat).toMatch(/never decides coverage/i);
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
    expect(dictate).toMatch(/width: var\(--composer-height\)/);
    expect(token("composer-height")).toBeGreaterThanOrEqual(MIN_TARGET_PX);
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
    expect(assistant).toMatch(/setDraft\(\s*draft\.trim\(\)/);
    const dictate = readFileSync("web/src/components/DictateButton.tsx", "utf8");
    expect(dictate).not.toMatch(/onSend|submit\(/);
  });

  // Two different actors, two different visual languages: rings travel outward
  // while the member speaks, bars rise and fall while the assistant does.
  it("distinguishes the assistant speaking from the member speaking", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    expect(css).toMatch(/@keyframes mic-ripple/);
    expect(css).toMatch(/@keyframes equalise/);
    expect(css).toMatch(/@keyframes halo-spin/);
    const voice = readFileSync("web/src/components/VoiceComposer.tsx", "utf8");
    expect(voice).toMatch(/phase === "listening" && !responding/);
    expect(voice).toMatch(/\{responding && \(/);
  });

  it("marks the answer being read aloud", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    expect(css).toMatch(/@keyframes read-sweep/);
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant).toMatch(/turn__answer--speaking/);
    expect(assistant.replace(/\s+/g, " ")).toMatch(/Reading this answer aloud/);
  });

  // Colour and motion alone would leave the state unreadable to anyone who
  // cannot see it, or who has motion turned off.
  it("states in words which answer is being read", () => {
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant).toMatch(/className="turn__reading" role="status"/);
  });

  it("holds the answer border transparent so starting playback cannot reflow it", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    const rule = /\.turn__answer \{([^}]*)\}/s.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/border: 3px solid transparent/);
  });

  it("stops every speaking animation under reduced motion", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    const reduced = css.slice(css.lastIndexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.turn__answer--speaking \{ animation: none/);
    expect(reduced).toMatch(/\.mic-halo__sweep \{ animation: none/);
    expect(reduced).toMatch(/\.equaliser span \{ animation: none/);
  });

  it("clears the reading state when playback ends", () => {
    const voice = readFileSync("web/src/voice.ts", "utf8");
    expect(voice).toMatch(/addEventListener\("ended"/);
    expect(voice).toMatch(/addEventListener\("end"/);
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant.replace(/\s+/g, " ")).toMatch(
      /onStateChange\(\(speaking\) => setSpeakingTurn\(speaking \? id : null\),?\s*\)/,
    );
  });

  it("labels the composer for screen readers", () => {
    expect(tsx).toMatch(/htmlFor="composer-input"/);
  });

  it("marks the conversation as a live region", () => {
    expect(tsx).toMatch(/aria-live="polite"/);
  });
});

describe("plan identity is never shown raw [D-055]", () => {
  // "H5141-004" is a contract number. A member reads a plan name or nothing.
  it("renders no contract-plan id in shipped markup", () => {
    const matches = markup.match(/["'>\s]H\d{4}-\d{3}["'<\s]/g) ?? [];
    expect(matches).toEqual([]);
  });

  /*
   * WCAG 2.2 excepts a target inline in a block of text from the target-size
   * criteria. Change sits inside the plan chip's own sentence, the same
   * exception .cite-marker relies on, and forcing 44px inflated the chip.
   */
  it("keeps the inline plan change control from inflating its chip", () => {
    expect(rule(".assistant__plan-change")).toContain("min-height: 0");
    const chip = rule(".meta-chip");
    expect(Number(/min-height:\s*(\d+)px/.exec(chip)?.[1])).toBeGreaterThanOrEqual(24);
  });

  it("gives the plan prompt a way out", () => {
    expect(markup).toContain("dismissPlanPrompt");
    expect(markup).toContain("Close, and answer without a plan");
  });

  it("shows the plan context as chips rather than a sentence", () => {
    expect(markup).toContain('className="assistant__meta"');
    expect(markup.match(/className="meta-chip/g)?.length).toBeGreaterThanOrEqual(4);
    expect(rule(".meta-chip")).toContain("var(--radius-pill)");
  });
});

describe("answer card [FR-P2-13, NFR-P2-06, D-068]", () => {
  // The amount is the dominant element, so it must outrank the reading surface
  // rather than merely differ from it.
  it("sets the amount above the 18px reading surface", () => {
    const amount = rule(".headline__amount");
    expect(amount).toContain("var(--text-heading)");
    expect(token("text-heading")).toBeGreaterThan(MIN_TEXT_PX);
  });

  it("labels the amount, so a bare figure is never shown alone", () => {
    expect(markup).toContain("headline__label");
    expect(rule(".headline__label").length).toBeGreaterThan(0);
  });

  it("keeps the citation at the reading size, not the mock's 11px", () => {
    expect(rule(".citations__staleness")).toContain("var(--text-body)");
    expect(token("text-body")).toBeGreaterThanOrEqual(14);
  });

  // Forest ink on cream paper. Large text needs 3:1, normal text 4.5:1.
  it("renders the amount in the darkest ink on the page", () => {
    expect(rule(".headline__amount")).toContain("var(--color-forest-ink)");
  });
});

describe("session surfaces [FR-P2-20 to FR-P2-23, D-071, D-073]", () => {
  it("gives every quick-reply chip a 44px target", () => {
    const chip = rule(".chip");
    expect(Number(/min-height:\s*(\d+)px/.exec(chip)?.[1])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(Number(/min-width:\s*(\d+)px/.exec(chip)?.[1])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it("gives the icon-only close and help controls a 44px target", () => {
    const icon = rule(".assistant__icon-button");
    expect(Number(/min-height:\s*(\d+)px/.exec(icon)?.[1])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    expect(Number(/min-width:\s*(\d+)px/.exec(icon)?.[1])).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  // An icon with no text needs a name, or a screen reader announces "button".
  it("names the icon-only controls for a screen reader", () => {
    expect(markup).toContain("Close the assistant");
    expect(markup).toMatch(/Show help|Hide help/);
  });

  // Help is a region, not a dialog: a dialog traps focus, which FR-P2-23 forbids.
  // The surrounding panel is separately a non-modal dialog, which is unrelated.
  it("exposes help as an expandable region rather than a dialog", () => {
    expect(markup).toContain('aria-expanded={helpOpen}');
    expect(markup).toContain('aria-controls="assistant-help"');
    const help = markup.slice(markup.indexOf('id="assistant-help"'));
    const region = help.slice(0, help.indexOf("</section>"));
    expect(region).not.toMatch(/role="dialog"|aria-modal|tabIndex/);
  });

  it("pins the header and composer so only the thread scrolls", () => {
    expect(rule(".assistant--panel")).toContain("grid-template-rows: auto 1fr auto");
    // A grid row will not shrink below its content without this.
    expect(rule(".assistant--panel > .assistant__scroll")).toContain("min-height: 0");
    expect(rule(".assistant--panel > .assistant__scroll")).toContain("overflow-y: auto");
  });

  // FR-13 needs the human path present in every state, not in a particular
  // region. It lives in the pinned foot, which never scrolls away.
  /*
   * The tools render into the pinned foot in the panel and into the rail on the
   * full page, through a portal. Either way they never scroll away, which is
   * what FR-13 requires of the human path.
   */
  it("keeps the human path in a pinned region, reachable at any scroll position", () => {
    expect(markup).toContain("chip--human");
    const foot = markup.slice(markup.indexOf('className="assistant__foot"'));
    expect(foot).toContain("{tools}");
    expect(rule(".assistant--panel > .assistant__foot")).toContain("padding");
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toContain('id="rail-slot"');
  });
});

describe("print output [FR-P2-20]", () => {
  const printBlock = /@media print\s*\{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? "";

  it("has a print stylesheet at all", () => {
    expect(printBlock.length).toBeGreaterThan(0);
  });

  it("drops interface chrome", () => {
    for (const chrome of [".launcher", ".chips", ".composer", ".feedback", ".assistant__corner"]) {
      expect(printBlock, chrome).toContain(chrome);
    }
  });

  // A citation list inside a scroll box prints as one clipped screenful.
  it("releases the scrolling region so the whole transcript prints", () => {
    expect(printBlock).toMatch(/\.assistant__scroll[\s\S]*overflow: visible/);
  });

  it("keeps the citation list, which is the point of printing", () => {
    expect(printBlock).not.toMatch(/\.citations\s*\{[^}]*display:\s*none/);
    expect(printBlock).toMatch(/\.citations\s*\{\s*break-inside: avoid/);
  });
});

describe("overlay and interface pass [D-074 to D-078]", () => {
  const app = readFileSync("web/src/App.tsx", "utf8");

  // A dialog that covers the page visually must cover it for the keyboard too,
  // or tabbing lands on controls hidden behind the backdrop. D-075.
  it("holds focus inside the panel while it is open", () => {
    expect(app).toContain('aria-modal="true"');
    expect(app).toMatch(/event\.key !== "Tab"/);
    expect(app).toMatch(/preventDefault\(\)/);
  });

  /*
   * `html, body { overflow-x: hidden }` makes the other axis compute to auto,
   * so the document element owns the scroll. Locking body alone left the page
   * scrolling behind the backdrop.
   */
  it("locks both scroll owners behind the overlay and releases them again", () => {
    expect(app).toMatch(/root\.style\.overflow = "hidden"/);
    expect(app).toMatch(/document\.body\.style\.overflow = "hidden"/);
    expect(app).toMatch(/root\.style\.overflow = previous\.root/);
    expect(app).toMatch(/document\.body\.style\.overflow = previous\.body/);
  });

  it("stops a wheel over the backdrop reaching the page behind it", () => {
    expect(rule(".backdrop")).toContain("overscroll-behavior: none");
    expect(rule(".assistant--panel > .assistant__scroll")).toContain("overscroll-behavior: contain");
  });

  it("closes on the backdrop, on Escape and on the X", () => {
    expect(app).toMatch(/className="backdrop"[\s\S]*onClick=\{closePanel\}/);
    expect(app).toMatch(/event\.key === "Escape"/);
    expect(app).toMatch(/onClose=\{closePanel\}/);
  });

  // D-076: a stray click must not discard a half-typed question.
  it("keeps the draft above the panel so closing does not lose it", () => {
    expect(app).toMatch(/const \[draft, setDraft\] = useState\(""\)/);
    expect(app).toContain("draft={draft}");
  });

  it("respects reduced motion on every animated element", () => {
    expect(app).toContain("useReducedMotion");
    expect(markup).toContain("useReducedMotion");
  });

  // One token, so the three cannot drift apart the next time one is touched.
  it("gives the composer field, the mic and the send control one height", () => {
    for (const selector of [".composer__input", ".dictate", ".composer .button--primary"]) {
      expect(rule(selector), selector).toMatch(/height: var\(--composer-height\)/);
    }
    expect(token("composer-height")).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  });

  it("keeps the mic perfectly round", () => {
    const dictate = rule(".dictate");
    expect(dictate).toMatch(/width: var\(--composer-height\)/);
    expect(dictate).toMatch(/height: var\(--composer-height\)/);
    expect(dictate).toMatch(/border-radius: 999px/);
  });

  // The indicator is drawn inside the radius rather than 2px outside it, and is
  // never removed - a text field matches :focus-visible on click by design. D-078.
  it("draws composer focus inside the field", () => {
    const focus = rule(".composer__input:focus-visible");
    expect(focus).toContain("outline-offset: -2px");
    expect(focus).toMatch(/box-shadow/);
  });

  it("caps the input at four lines and 3000 characters", () => {
    // Four line boxes plus the padding and border that make up the resting height.
    expect(rule(".composer__input")).toMatch(/max-height: calc\(24px \* 4/);
    expect(rule(".composer__input")).toMatch(/line-height: 24px/);
    expect(markup).toMatch(/maxLength=\{3_000\}/);
  });

  it("shows scrollbars only while they are wanted", () => {
    expect(css).toMatch(/scrollbar-width: thin/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb \{[^}]*background: transparent/);
    expect(css).toMatch(/:hover::-webkit-scrollbar-thumb/);
  });

  // Voice filled the pinned foot and squeezed the thread to a sliver, so an
  // answer could be heard but not read.
  /*
   * Voice used to fill the pinned foot and squeeze the thread to a sliver, so an
   * answer could be heard but not read. A height cap was the first fix; the
   * horizontal stage is the real one, and it holds without capping anything.
   */
  it("keeps the voice stage short enough that the transcript stays readable", () => {
    const stage = rule(".voice__stage");
    expect(stage).toContain("display: flex");
    expect(stage).toContain("align-items: center");
    expect(rule(".mic-well")).toMatch(/height: 128px/);
  });

  // Icon-only is right for close, expand and help; switching how you speak to
  // the assistant is the one header control worth naming.
  // Beside the close control it is an icon; in the rail it sits with the named
  // tools and carries its own label.
  it("labels the help control in the rail and leaves it an icon in the header", () => {
    expect(markup).toContain('railId === undefined ? "assistant__icon-button" : "assistant__mode"');
    expect(markup).toMatch(/\{helpOpen \? "Hide help" : "Show help"\}/);
  });

  it("names the voice toggle rather than leaving it an icon", () => {
    expect(markup).toMatch(/Switch to voice/);
    expect(markup).toMatch(/Switch to text/);
    expect(markup).toContain('aria-pressed={mode === "voice"}');
    const mode = rule(".assistant__mode");
    expect(Number(/min-height:\s*var\(--target-min\)/.test(mode))).toBe(1);
    expect(mode).toContain("white-space: nowrap");
  });

  /*
   * Help and the voice toggle render once each: in the panel's header, or in the
   * full page's rail. The condition is the same for both, so they cannot appear
   * twice or vanish from one variant.
   */
  it("renders help and the voice toggle exactly once, in one place per variant", () => {
    expect(markup.match(/railId === undefined && helpControl/g)).toHaveLength(1);
    expect(markup.match(/railId !== undefined && helpControl/g)).toHaveLength(1);
    expect(markup.match(/railId === undefined && modeControl/g)).toHaveLength(1);
    expect(markup.match(/railId !== undefined && modeControl/g)).toHaveLength(1);
    const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>"));
    expect(header).not.toContain("chip--human");
  });

  // The rail carries the human path as a card, so the tools must not repeat it.
  it("shows the human path once on the full page", () => {
    expect(rule(".rail .chip--human")).toContain("display: none");
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toContain("rail__call");
  });

  it("lays the starters out two across on the full page", () => {
    expect(rule(".assistant--page .starters")).toContain("repeat(2, minmax(0, 1fr))");
  });

  it("states both things FR-15 requires, briefly", () => {
    const scope = markup.replace(/\s+/g, " ");
    expect(scope).toMatch(/not a clinician/i);
    expect(scope).toMatch(/never decides coverage/i);
  });
});

describe("brand surfaces [DESIGN.md]", () => {
  const shell = readFileSync("web/index.html", "utf8");
  const landing = readFileSync("web/src/landing.css", "utf8");
  const tokens = readFileSync("web/src/tokens.css", "utf8");

  it("serves a favicon", () => {
    expect(shell).toMatch(/rel="icon"[^>]*href="\/favicon\.png"/);
  });

  // DESIGN.md names both faces. Neither is a serif, and a Garamond substitute
  // is what made the assistant title read wrong.
  it("uses the two faces DESIGN.md names, with its own fallbacks", () => {
    expect(tokens).toContain('"Faire Octave"');
    expect(tokens).toContain('"Suisse Intl"');
    expect(tokens).not.toMatch(/Cormorant|ui-serif|Georgia/);
  });

  it("fetches no webfont, since neither face is on a public CDN", () => {
    expect(shell).not.toMatch(/fonts\.googleapis\.com/);
  });

  // DESIGN.md: 14px on all cards and buttons, 999px on badges and tags only.
  it("gives buttons a 14px radius rather than a pill", () => {
    expect(rule(".button")).toContain("var(--radius-md)");
    expect(rule(".chip")).toContain("var(--radius-md)");
    expect(landing).toMatch(/\.cl-btn \{[^}]*border-radius: 14px/s);
    expect(landing).not.toMatch(/border-radius: 999px/);
  });

  it("keeps the pill for the badge, which is a tag", () => {
    expect(rule(".assistant__badge")).toContain("var(--radius-pill)");
  });

  it("puts icons on the landing calls to action and the launcher", () => {
    const landingTsx = readFileSync("web/src/components/Landing.tsx", "utf8");
    expect(landingTsx).toContain("react-icons/io5");
    const app = readFileSync("web/src/App.tsx", "utf8");
    expect(app).toMatch(/IoChatbubbleEllipses[\s\S]*Ask the assistant/);
  });

  // The full page had no row structure at all, so the composer drifted down the
  // page and the rail was a tall empty block.
  it("gives the full page the same pinned rows as the panel", () => {
    expect(rule(".assistant--page")).toContain("grid-template-rows: auto 1fr auto");
    expect(rule(".assistant--page > .assistant__scroll")).toContain("min-height: 0");
    // The banner is above the workspace, so the column owns the viewport height
    // and the workspace takes what is left. 100vh on the workspace made the
    // document taller than the screen and the whole page scrolled.
    expect(rule(".fullscreen")).toContain("height: 100dvh");
    expect(rule(".fullscreen")).toContain("overflow: hidden");
    expect(rule(".workspace")).toContain("min-height: 0");
  });
});

describe("empty state and conversation alignment", () => {
  // The heading and chips sit at the column's left edge; a centred conversation
  // floated away from them.
  it("aligns the conversation and composer with the header on the full page", () => {
    // rule() builds a regex from the selector and these end in "*", so match the
    // stylesheet directly rather than through it.
    expect(css).toMatch(/\.assistant--page > \.assistant__scroll > \*\s*\{[^}]*margin-inline: 0/);
    expect(css).toMatch(/\.assistant--page > \.assistant__foot > \*\s*\{[^}]*margin-inline: 0/);
  });

  // Only while it is the only thing on screen: a real conversation pushes it out
  // and the thread flows from the top again.
  // No conversation to align to yet, so the opening screen sits in the middle;
  // the first answer moves it left and it stays there.
  it("centres the opening screen horizontally until a question is asked", () => {
    expect(markup).toContain('assistant--empty');
    expect(markup).toContain("turns.length === 0 && planPrompt === null");
    expect(css).toMatch(
      /\.assistant--page\.assistant--empty > \.assistant__scroll > \*[\s\S]*?margin-inline: auto/,
    );
  });

  it("centres the empty state vertically in both variants", () => {
    expect(rule(".empty")).toContain("margin-block: auto");
    expect(rule(".assistant__thread")).toContain("flex: 1");
  });
});

describe("waiting state [D-077]", () => {
  // It used to render below the composer while the thread showed a static
  // fallback, so the staged messages were never the thing anyone saw.
  it("shows the rotating message where the answer will appear", () => {
    const pending = markup.slice(markup.indexOf('className="turn__pending"'));
    expect(pending.slice(0, 800)).toContain("{progress ||");
    expect(pending.slice(0, 800)).toContain("AnimatePresence");
  });

  it("announces progress from one live region, not two", () => {
    expect(markup.match(/aria-live="polite"/g)?.length).toBeLessThanOrEqual(2);
    const foot = markup.slice(markup.indexOf('className="assistant__status"'));
    expect(foot.slice(0, 200)).not.toContain("progress");
  });

  // Anchored to the top-level rule: the reduced-motion override for the same
  // selector appears earlier in the file and rule() returns the first match.
  it("sweeps the text rather than adding a spinner beside it", () => {
    expect(css).toMatch(/^\.turn__pending-text \{[^}]*animation: pending-sweep/m);
    expect(css).toContain("@keyframes pending-sweep");
  });

  // A sweep is decoration; the message carries the meaning on its own.
  it("drops the sweep and restores solid text under reduced motion", () => {
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*?\.turn__pending-text \{[^}]*animation: none[^}]*color: var\(--color-forest-ink\)/,
    );
  });
});

describe("long answers [FR-32]", () => {
  const answerBody = readFileSync("web/src/components/AnswerBody.tsx", "utf8");

  // FR-32: prose is rendered by the application, never by the model. Grouping is
  // presentation over the typed claims, not markup the model emitted.
  it("groups claims in the renderer rather than asking the model for markup", () => {
    expect(answerBody).toContain("groupClaims(claims, citations)");
    expect(answerBody).not.toMatch(/dangerouslySetInnerHTML|marked|remark|markdown/i);
  });

  it("keeps every claim's citation markers inside its group", () => {
    const loop = answerBody.slice(answerBody.indexOf("group.claims.map"));
    expect(loop).toContain("claim.citationIds");
    expect(loop).toContain("cite-marker");
  });

  it("labels a group with the section its source came from", () => {
    expect(answerBody).toContain("group.heading");
    expect(rule(".claim-group__heading")).toContain("var(--text-body)");
  });
});

describe("voice stage layout [D-045]", () => {
  const voice = readFileSync("web/src/components/VoiceComposer.tsx", "utf8");

  // The stage filled the panel because the text sat in a column under the
  // control. Beside it, the same content is a fraction of the height.
  it("puts the text beside the control rather than under it", () => {
    expect(rule(".voice__stage")).toContain("display: flex");
    expect(rule(".voice__stage")).toContain("align-items: center");
    expect(voice).toContain('className="voice__lines"');
  });

  // The press target is a requirement for a hand with tremor, not decoration.
  it("keeps the control at its specified 112px", () => {
    expect(rule(".mic")).toMatch(/width: 112px/);
    expect(rule(".mic")).toMatch(/min-height: 112px/);
  });

  // The control itself is the icon; repeating it on each line was noise.
  it("changes the second line when reading aloud rather than repeating dictation copy", () => {
    expect(voice).toContain("The written answer is above, and you can scroll while it plays.");
    expect(voice).toContain("You can change the words before they are sent.");
  });

  it("aligns the stacked button rows to one edge", () => {
    expect(rule(".voice__actions, .voice__playback")).toContain("justify-content: flex-start");
  });

  // Stop with nothing playing is a control that does nothing.
  it("disables Stop while no answer is playing", () => {
    expect(markup).toContain("disabled={speakingTurn === null}");
  });

  // The composer owns its listening and review phases, so clearing the thread
  // has to remount it or voice stays on whatever screen it was left on.
  it("resets the voice surface when the conversation is cleared", () => {
    expect(markup).toContain("key={voiceReset}");
    expect(markup).toMatch(/const resetVoice[\s\S]*?setVoiceReset/);
    expect(markup).toMatch(/const forgetHistory = \(\): void => \{\s*resetVoice\(\);/);
    expect(markup).toMatch(/const startOver = \(\): void => \{\s*resetVoice\(\);/);
  });

  it("draws transcript focus inside the field, as the composer does", () => {
    expect(rule(".voice__transcript:focus-visible")).toContain("outline-offset: -2px");
  });

  it("separates the playback buttons from the stage above them", () => {
    expect(rule(".voice__actions, .voice__playback")).toContain("margin-top: 5px");
  });
});

describe("voice stage overflow", () => {
  // The rings pulse to roughly 1.8x their 112px base and overflow the 128px
  // well by design. A scrolling ancestor turned that decoration into a
  // scrollbar that tracked the animation.
  it("does not make the voice region scrollable", () => {
    expect(css).not.toMatch(/\.assistant--panel \.voice \{[^}]*overflow-y: auto/);
  });

  it("clips the pulse to its own block instead", () => {
    expect(rule(".voice__stage")).toContain("overflow: hidden");
  });
});
