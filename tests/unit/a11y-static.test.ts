import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What the accessibility floor can assert without a browser: type scale,
 * target size, focus visibility and two interaction rules. Not a browser scan.
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

/** The 18px floor covers the reading surface; chrome uses the design scale. */
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

  // The floor follows the question, which now sits on the card's title.
  it("applies it to the starter questions, which are questions about to be asked", () => {
    expect(rule(".starter__title")).toMatch(/font-size:\s*var\(--text-message\)/);
  });

  // A card that sends something other than what it shows is a small lie.
  it("asks exactly the question the card displays", () => {
    expect(markup).toContain("{starter.question}");
    expect(markup).toMatch(/submit\(starter\.question, plan\)/);
  });

  // Below 16px, iOS zooms the page when the field takes focus.
  it("keeps the composer input at 16px or above", () => {
    expect(token("text-input")).toBeGreaterThanOrEqual(16);
    expect(rule(".composer__input")).toMatch(/font-size:\s*var\(--text-input\)/);
  });

  // The mock set the trust surface at 11px, the smallest type on screen.
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
  // A route to a human in every state. The host page uses Clover's own wording.
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

  // Said "no member data is held" until sign-in made that false. Both languages.
  it("states that every member record is demonstration data [NFR-SEC-01]", () => {
    const strings = readFileSync("web/src/strings.ts", "utf8");
    expect(strings).toMatch(/No real member data is held/);
    expect(strings).toMatch(/No se guardan datos reales/);
    expect(tsx).toContain('say("syntheticNotice")');
  });

  it("offers between four and six starter questions [FR-14]", () => {
    const starters = tsx.match(/driver:\s*"A-\d\d"/g) ?? [];
    expect(starters.length).toBeGreaterThanOrEqual(4);
    expect(starters.length).toBeLessThanOrEqual(6);
  });

  // An unaffiliated deploy must not publish a routable support line.
  it("never shows the real Clover number", () => {
    const strings = readFileSync("web/src/strings.ts", "utf8");
    expect(tsx + strings).not.toMatch(/1-888-778-1478/);
    // In strings.ts, so the PDF export reaches it without importing React.
    expect(strings).toMatch(/1-555-0100/);
  });

  // The notice collapses rather than disappearing, so the page always
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

  // A mis-heard word must be fixable before the question is asked.
  it("places a dictated transcript in the composer rather than sending it", () => {
    const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
    expect(assistant).toMatch(/onTranscript=\{\(text\) =>/);
    expect(assistant).toMatch(/setDraft\(\s*draft\.trim\(\)/);
    const dictate = readFileSync("web/src/components/DictateButton.tsx", "utf8");
    expect(dictate).not.toMatch(/onSend|submit\(/);
  });

  // Two actors, two visual languages: rings outward, bars rising and falling.
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

  // Colour and motion alone fail anyone who cannot see them.
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

  // WCAG 2.2 excepts inline targets; forcing 44px inflated the chip.
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
  // The dominant element must outrank the reading surface, not merely differ.
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

  // A region, not a dialog: a dialog would trap focus.
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

  // Present in every state. Pinned foot in the panel, rail on the full page,
  // and neither scrolls away.
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

const strings = readFileSync("web/src/strings.ts", "utf8");

describe("overlay and interface pass [D-074 to D-078]", () => {
  const app = readFileSync("web/src/App.tsx", "utf8");

  // A dialog covering the page visually must cover it for the keyboard too.
  it("holds focus inside the panel while it is open", () => {
    expect(app).toContain('aria-modal="true"');
    expect(app).toMatch(/event\.key !== "Tab"/);
    expect(app).toMatch(/preventDefault\(\)/);
  });

  // overflow-x hidden makes the other axis auto, so the document owns the scroll.
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

  // A stray click must not discard a half-typed question.
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

  // Drawn inside the radius, and never removed: a field matches on click.
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

  // Voice filled the foot and squeezed the thread, so an answer could be
  // heard but not read. The horizontal stage fixes it without a height cap.
  it("keeps the voice stage short enough that the transcript stays readable", () => {
    const stage = rule(".voice__stage");
    expect(stage).toContain("display: flex");
    expect(stage).toContain("align-items: center");
    expect(rule(".mic-well")).toMatch(/height: 128px/);
  });

  // Labelled where there is room for words, an icon where there is not.
  it("labels the help control in the rail and leaves it an icon elsewhere", () => {
    expect(markup).toContain('railId === undefined || isPhone ? "assistant__icon-button" : "assistant__mode"');
    expect(markup).toMatch(/\{helpOpen \? "Hide help" : "Show help"\}/);
    // The label is always present for a screen reader, visible or not.
    expect(markup).toMatch(/railId === undefined \|\| isPhone \? \(\s*<span className="visually-hidden">/);
  });

  it("names the voice toggle rather than leaving it an icon", () => {
    // The label moved into the copy module when the panel gained Spanish.
    expect(strings).toMatch(/switchToVoice: \["Switch to voice", ".+"\]/);
    expect(strings).toMatch(/switchToText: \["Switch to text", ".+"\]/);
    // Short forms on a phone, where the long ones make the bar a width floor.
    expect(strings).toMatch(/switchToTextShort: \["Text", ".+"\]/);
    expect(markup).toMatch(/say\(isPhone \? "switchToTextShort" : "switchToText"\)/);
    expect(markup).toContain('aria-pressed={mode === "voice"}');
    const mode = rule(".assistant__mode");
    expect(Number(/min-height:\s*var\(--target-min\)/.test(mode))).toBe(1);
    expect(mode).toContain("white-space: nowrap");
  });

  // One condition for both, so neither doubles nor vanishes from a variant.
  it("renders help and the voice toggle exactly once, in one place per variant", () => {
    // Written once, placed by where the fragment is rendered.
    expect(markup.match(/railId === undefined && helpControl/g)).toHaveLength(1);
    expect(markup.match(/railId === undefined && modeControl/g)).toHaveLength(1);
    expect(markup.match(/const controls = \(/g)).toHaveLength(1);
    expect(markup).toMatch(/isPhone \? controls : railTools/);
    const header = markup.slice(markup.indexOf("<header"), markup.indexOf("</header>"));
    expect(header).not.toContain("chip--human");
  });

  // The rail carries the human path as a card; the tools must not repeat it.
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

  // Neither face is a serif; a Garamond substitute read wrong.
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

  // Without row structure the composer drifted and the rail was empty.
  it("gives the full page the same pinned rows as the panel", () => {
    expect(rule(".assistant--page")).toContain("grid-template-rows: auto 1fr auto");
    expect(rule(".assistant--page > .assistant__scroll")).toContain("min-height: 0");
    // The column owns the viewport height; 100vh on the workspace scrolled the page.
    expect(rule(".fullscreen")).toContain("height: 100dvh");
    expect(rule(".fullscreen")).toContain("overflow: hidden");
    expect(rule(".workspace")).toContain("min-height: 0");
  });
});

describe("empty state and conversation alignment", () => {
  // A centred conversation floated away from the heading's left edge.
  it("aligns the conversation and composer with the header on the full page", () => {
    // These selectors end in "*", which rule() cannot build a regex from.
    expect(css).toMatch(/\.assistant--page > \.assistant__scroll > \*\s*\{[^}]*margin-inline: 0/);
    expect(css).toMatch(/\.assistant--page > \.assistant__foot > \*\s*\{[^}]*margin-inline: 0/);
  });

  // Centred only while it is the only thing on screen.
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
  // Below the composer it was never the thing anyone saw.
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

  // rule() returns the first match, and reduced motion overrides this earlier.
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

  // Grouping is presentation over typed claims, not markup the model emitted.
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

  // Text under the control filled the panel; beside it, a fraction of the height.
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

  // Stop only reset the position, which the button beside it already does.
  // Paused audio has a place to return to, so Pause stays available.
  it("disables the transport only when there is nothing to pause or resume", () => {
    expect(markup).toContain("disabled={speakingTurn === null && !paused}");
    // The mic keeps a stop icon for recording; playback no longer has one.
    const playback = markup.slice(markup.indexOf('className="voice__playback"'));
    expect(playback.slice(0, 1600)).not.toContain("IoStop");
    expect(playback.slice(0, 1600)).toContain("IoPause");
  });

  it("shows a disabled control as disabled, and says so to the pointer", () => {
    const css = readFileSync("web/src/app.css", "utf8");
    expect(css).toMatch(/\.button:disabled[\s\S]{0,120}cursor: not-allowed;/);
  });

  // Clearing the thread must remount it, or voice stays on the old screen.
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
  // Rings overflow the well by design; a scrolling ancestor made that a scrollbar.
  it("does not make the voice region scrollable", () => {
    expect(css).not.toMatch(/\.assistant--panel \.voice \{[^}]*overflow-y: auto/);
  });

  it("clips the pulse to its own block instead", () => {
    expect(rule(".voice__stage")).toContain("overflow: hidden");
  });
});
