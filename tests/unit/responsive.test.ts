import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("web/src/app.css", "utf8");
const landing = readFileSync("web/src/landing.css", "utf8");
const shell = readFileSync("web/src/App.tsx", "utf8");
const viewport = readFileSync("web/src/viewport.ts", "utf8");
const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");

/** Everything below the phone breakpoint, as one string. */
const phoneRules = [...app.matchAll(/@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/g)]
  .map((match) => match[1])
  .join("\n");

describe("the width floor that clipped every viewport [FR-P3-45]", () => {
  // A flex item's default min-width is auto, so it refuses to shrink below its
  // content. `.assistant__bar` was nowrap, making its min-content width a floor
  // for the whole panel: 726px of content inside a 576px frame at 1440, and
  // inside a 393px one on a phone.
  it("clears the min-width floor at every width, not only on phones", () => {
    // The rule must sit outside every media query, so strip them all and look
    // in what is left rather than trusting where it appears in the file.
    const unconditional = app.replace(/@media [^{]+\{[\s\S]*?\n\}/g, "");
    expect(unconditional).toMatch(/\.assistant__bar,/);
    expect(unconditional).toMatch(/\.assistant__scroll,/);
    expect(unconditional).toMatch(/min-width: 0;/);
    // The bar holds one line and lets the title truncate, which is what keeps
    // the controls hard against the right edge instead of under the heading.
    expect(unconditional).toMatch(/\.assistant__bar \{[^}]*flex-wrap: nowrap;/);
    expect(unconditional).toMatch(/\.assistant__title \{[^}]*text-overflow: ellipsis;/);
    expect(unconditional).toMatch(/\.assistant__corner \{ margin-left: auto; \}/);
  });

  it("says why in the source, because the symptom looked like a phone bug", () => {
    expect(app).toMatch(/not a phone bug/i);
  });
});

describe("the assistant is the whole page on a phone [FR-P3-45]", () => {
  it("matches the CSS breakpoint from one constant", () => {
    expect(viewport).toContain("export const PHONE_MAX = 48");
    expect(viewport).toMatch(/max-width: \$\{String\(PHONE_MAX\)\}rem/);
    expect(app).toContain("@media (max-width: 48rem)");
  });

  it("opens the full page rather than a panel", () => {
    expect(shell).toMatch(/isPhone \? go\("assistant"\) : setPanelOpen\(true\)/);
  });

  // A panel left open while the window narrows would become a clipped overlay.
  it("converts an open panel when the viewport crosses the breakpoint", () => {
    expect(shell).toMatch(/if \(isPhone && panelOpen\)[\s\S]{0,120}go\("assistant"\)/);
  });

  // The bar beside Back, not the assistant header: it is where a member looks
  // for them, and it keeps the header to a title and the plan context.
  it("puts the controls in the top bar and leaves the actions above the composer", () => {
    expect(assistant).toMatch(/isPhone \? controls : railTools/);
    expect(assistant).toMatch(/railId !== undefined && isPhone && chips/);
  });
});

describe("the phone layout [FR-P3-45]", () => {
  it("gives the starters one column, where the second was sliced in half", () => {
    expect(phoneRules).toMatch(/\.starters,\s*\n\s*\.assistant--page \.starters \{ grid-template-columns: 1fr; \}/);
  });

  it("stacks the voice stage so the mic is not competing with a paragraph", () => {
    expect(phoneRules).toMatch(/\.voice__stage \{ flex-direction: column;/);
  });

  // The human path must stay on screen without a tap, which the chips row does.
  it("drops the rail's human card rather than repeating the chip", () => {
    expect(phoneRules).toContain(".rail__human { display: none; }");
    expect(phoneRules).toMatch(/Talk to a person/);
  });

  it("turns the rail into a bar holding the way back", () => {
    expect(phoneRules).toMatch(/\.rail \{[\s\S]*?flex-direction: row;/);
  });
});

describe("the phone height budget [FR-P3-45]", () => {
  // Measured at 393x852: the conversation had 287px of 852 before this.
  it("collapses the status line that reserved a blank row", () => {
    expect(phoneRules).toContain(".assistant__status { min-height: 0; }");
  });

  it("shortens the placeholder that wrapped and clipped in a 48px field", () => {
    expect(assistant).toMatch(/isPhone \? say\("askPlaceholderShort"\)/);
    expect(readFileSync("web/src/strings.ts", "utf8")).toContain("askPlaceholderShort");
  });

  it("does not scroll an empty thread past its own heading", () => {
    expect(assistant).toMatch(/if \(turns\.length === 0 && planPrompt === null\) return;/);
  });
});

describe("the landing page on a phone [FR-P3-45]", () => {
  const phoneLanding = [...landing.matchAll(/@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join("\n");

  // A wrapping flex row with space-between produced ragged half-rows.
  it("stacks the nav into one tap target per row", () => {
    expect(phoneLanding).toMatch(/\.cl-nav__list \{ flex-direction: column;/);
  });

  // Nielsen Norman is explicit that hiding primary nav fails this audience.
  it("uses no hamburger", () => {
    const markup = readFileSync("web/src/components/Landing.tsx", "utf8");
    expect(markup).not.toMatch(/aria-expanded|menu-toggle|navOpen/i);
    expect(phoneLanding).not.toMatch(/\.cl-nav__list \{[^}]*display: none/);
  });

  it("keeps the dismiss control clear of the notice text", () => {
    expect(phoneLanding).toMatch(/\.cl-disclaimer \{ padding: 10px 44px; \}/);
  });
});

describe("a middle tier uses the width it has [FR-P3-45]", () => {
  it("gives a portrait tablet two columns without bringing back the rail", () => {
    expect(app).toMatch(/@media \(min-width: 34rem\) and \(max-width: 48rem\)/);
  });
});

describe("the ten fixes from the device pass [FR-P3-45]", () => {
  const phoneRules2 = [...app.matchAll(/@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join("\n");

  it("gives the help panel its own way out, top right", () => {
    expect(assistant).toContain('className="help__head"');
    expect(assistant).toMatch(/onClick=\{\(\) => setHelpOpen\(false\)\}/);
    expect(app).toMatch(/\.help__head \{[^}]*justify-content: space-between;/);
  });

  // auto-fit gave three across and one orphan below when the panel widened.
  it("fixes the starter grid at two columns rather than letting it reflow", () => {
    expect(app).toMatch(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(app).toMatch(/\.starters \{[\s\S]*?margin-inline: auto;/);
    expect(app).not.toMatch(/repeat\(auto-fit, minmax\(15rem/);
  });

  it("shrinks the two chips whose icon carries the meaning, not the two that matter", () => {
    expect(assistant).toMatch(/chip chip--compact" onClick=\{\(\) => void saveTranscript\(\)\}/);
    expect(assistant).toMatch(/chip chip--compact" onClick=\{forgetHistory\}/);
    // Has to out-specify `.chips .chip`, or the width lands and the font-size
    // does not: a 44px button holding the whole label.
    expect(phoneRules2).toMatch(/\.chips \.chip--compact \{/);
    expect(phoneRules2).toMatch(/\.chips \.chip--compact svg \{/);
    // "Talk to a person" and "Start over" keep their words.
    expect(assistant).toMatch(/className="chip" onClick=\{startOver\}/);
  });

  it("lays the mic beside its words and shrinks it", () => {
    expect(phoneRules2).toMatch(/\.voice__stage \{ flex-direction: row;/);
    expect(phoneRules2).toMatch(/\.mic \{ width: 72px;/);
  });

  it("lays the starter icon beside its words", () => {
    expect(phoneRules2).toMatch(/\.starter \{[\s\S]*?grid-template-columns: auto 1fr;/);
  });

  // 100vh counts browser chrome that 100dvh does not, and the difference showed
  // up as a screen of white below the composer.
  it("locks the page scroll on the full-page route, not only under the panel", () => {
    expect(shell).toMatch(/if \(!panelOpen && route !== "assistant"\) return;/);
    expect(shell).toMatch(/\}, \[panelOpen, route\]\);/);
  });

  it("keeps the launcher to the width of its words, in the corner", () => {
    const landingPhone = [...landing.matchAll(/@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/g)]
      .map((match) => match[1])
      .join("\n");
    expect(landingPhone).toMatch(/\.launcher \{[\s\S]*?width: auto;/);
    expect(landingPhone).toMatch(/\.launcher \{[\s\S]*?left: auto;/);
  });

  // The rail became the page's width floor the first time it was made a row.
  it("never lets the top bar become a width floor again", () => {
    expect(phoneRules2).toMatch(/\.rail \{ flex-wrap: wrap; min-width: 0; \}/);
    expect(phoneRules2).toMatch(/#rail-slot \{[\s\S]*?flex-wrap: wrap; min-width: 0;/);
  });
});

describe("the second device pass [FR-P3-45]", () => {
  const phone = [...app.matchAll(/@media \(max-width: 48rem\) \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .join("\n");

  it("sizes the help glyph to the controls beside it", () => {
    expect(assistant).toContain('railId === undefined || isPhone ? "assistant__icon-button" : "assistant__mode"');
    expect(phone).toMatch(/\.rail \.assistant__icon-button svg \{/);
  });

  // The labelled chips wrapped to two lines each, costing the height the single
  // row was meant to save.
  it("keeps each action on one line and the row on one row at the floor", () => {
    expect(phone).toMatch(/\.chips \.chip \{[\s\S]*?white-space: nowrap;/);
    expect(app).toMatch(/@media \(max-width: 24\.5rem\) \{\s*\n\s*\.chips \{ flex-wrap: wrap; \}/);
  });

  // `.assistant--page > .assistant__foot` sets gap 16 and out-specifies a bare
  // `.assistant__foot`, so the override has to match it.
  it("tightens the foot with matching specificity", () => {
    expect(phone).toMatch(/\.assistant--page > \.assistant__foot,\s*\n\s*\.assistant--panel > \.assistant__foot \{ gap:/);
  });

  // The radius lives in the sweep's own mask, and `.mic-halo` is inset:0, so
  // sizing the wrapper does nothing. Desktop tunes the band to a 112px mic;
  // this one is 72px and every number has to scale with it.
  it("scales the halo's mask to the smaller mic, not just its wrapper", () => {
    expect(phone).toMatch(/\.mic-halo__sweep \{[\s\S]*?width: 96px;/);
    expect(phone).toMatch(/mask: radial-gradient\(circle, transparent 38px, #000 40px, #000 46px, transparent 48px\)/);
    expect(phone).not.toMatch(/\.mic-halo \{ width:/);
  });

  it("leaves the desktop ring alone", () => {
    const base = app.replace(/@media [^{]+\{[\s\S]*?\n\}/g, "");
    expect(base).toMatch(/\.mic-halo__sweep \{[\s\S]*?width: 148px;/);
    expect(base).toMatch(/transparent 60px, #000 62px, #000 72px, transparent 74px/);
  });
});

describe("playback is pause and resume, not stop [D-045]", () => {
  const voice = readFileSync("web/src/voice.ts", "utf8");

  it("both audio tiers can hold their place", () => {
    expect(voice).toMatch(/pause: \(\) => \{\s*\n\s*window\.speechSynthesis\.pause\(\)/);
    expect(voice).toMatch(/resume: \(\) => \{\s*\n\s*window\.speechSynthesis\.resume\(\)/);
    expect(voice).toMatch(/pause: \(\) => \{\s*\n\s*audio\.pause\(\);/);
  });

  // The listener could not tell a member pausing from playback ending, which
  // with a resume path are different states.
  it("no longer treats a pause as the end of playback", () => {
    expect(voice).not.toMatch(/addEventListener\("pause"/);
  });

  it("keeps both buttons in place rather than relabelling one under a finger", () => {
    expect(assistant).toMatch(/say\("playAgain"\)/);
    expect(assistant).toMatch(/paused \? \(/);
    expect(assistant).toMatch(/say\("resumeAnswer"\)/);
    expect(assistant).toMatch(/say\("pauseAnswer"\)/);
  });
});

describe("the rail is one set of tools [FR-P3-48]", () => {
  it("orders them deliberately rather than inheriting the chips row", () => {
    const rail = assistant.slice(assistant.indexOf("const railTools = ("));
    const order = ["modeControl", "languageControl", "startOverChip", "clearChip", "savePdfChip", "helpControl"];
    let cursor = 0;
    for (const name of order) {
      const at = rail.indexOf(name, cursor);
      expect(at, name).toBeGreaterThan(-1);
      cursor = at;
    }
  });

  it("gives every tool the same width and ground", () => {
    expect(app).toMatch(/\.rail__tools > \* \{[\s\S]*?width: 100%;/);
    expect(app).toMatch(/\.rail__tools > \* \{[\s\S]*?background: var\(--color-cream-paper\);/);
  });

  // A tool that stays highlighted after a click looks selected, and none of
  // these is a selection: they act and finish.
  it("changes ground on hover only, not on pressed or expanded", () => {
    expect(app).toMatch(/\.rail__tools > \*\[aria-pressed="true"\],\s*\n\s*\.rail__tools > \*\[aria-expanded="true"\] \{\s*\n\s*background: var\(--color-cream-paper\);/);
    expect(app).toMatch(/\.rail__tools > \*:hover \{ background: var\(--color-keylime-wash\); \}/);
  });

  // Navigation, not a tool: it leaves the page the others act on.
  it("sets Back apart from the set, and out-specifies the base rule", () => {
    expect(app).toMatch(/\.rail > \.rail__back \{[\s\S]*?border: 0;/);
    expect(app.indexOf(".rail > .rail__back")).toBeLessThan(app.indexOf(".rail__back {\n  display: inline-flex"));
  });

  it("keeps the phone bar on the plain controls, with no tools column", () => {
    expect(assistant).toMatch(/isPhone \? controls : railTools/);
  });
});

describe("a disabled control reads as disabled [NFR-A11Y-04]", () => {
  // Fading a filled button takes the label down with the fill. Forcing a text
  // colour on every variant gave this one dark text on a dark ground at half
  // opacity, which is unreadable rather than merely quiet.
  it("gives the filled button an inert ground instead of dimming it", () => {
    expect(app).toMatch(/\.button\.button--primary:disabled,[\s\S]*?opacity: 1;/);
    expect(app).toMatch(/\.button\.button--primary:disabled,[\s\S]*?background: var\(--color-border-mist\);/);
    expect(app).toMatch(/\.button\.button--primary:disabled,[\s\S]*?color: var\(--color-charcoal\);/);
  });

  // The generic rule sits later in the file, so the override has to out-specify
  // it rather than rely on order. This stylesheet has caught that three times.
  it("wins on specificity rather than on file order", () => {
    expect(app).toContain(".button.button--primary:disabled");
    expect(app).not.toMatch(/\n\.button--primary:disabled \{/);
  });

  it("leaves the generic rule to set no colour at all", () => {
    const generic = app.slice(app.indexOf(".button:disabled,\n.button[disabled] {"));
    // Not `border-color`, which the hyphen makes a word boundary.
    expect(generic.slice(0, 160)).not.toMatch(/[;{]\s*color:/);
    expect(generic.slice(0, 160)).toMatch(/cursor: not-allowed;/);
  });
});
