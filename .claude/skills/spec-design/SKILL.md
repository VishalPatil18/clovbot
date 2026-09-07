---
name: spec-design
description: Build design/design.md and populate design/preview/ with generated UI assets. Use when the user says "let's design the UI", "build the design system", or invokes `/spec-design`. Enforces FR-DESIGN-01..05: reference-driven when a reference is supplied, inferred from srs.md otherwise, refuses to fabricate brand colors, and produces tokens, components, do's and don'ts, and a surface map.
---

# spec-design

Produce the project's design system in `design/design.md` and any concrete HTML/CSS/JS reference assets in `design/preview/`. Run this after `/spec-requirements` and before `/spec-plan`.

The template `templates/design/design.md` gives you the section skeleton (Style Statement, Tokens - Colors, Tokens - Typography, Tokens - Spacing & Shape, Components, Do's and Don'ts, Surfaces, Imagery & Motion, Quick Start CSS). Your job is to fill it in either from a reference the user supplies, or by inferring from `claude/srs.md`.

---

## Step 1 - Ask for a reference (FR-DESIGN-01)

Before generating anything, ask:

> Do you have a design reference for this project? That can be a URL, a screenshot, a brand you want to feel like, or a design-prompt from the Throughspec design prompt library. If you do not, I will infer a direction from your srs.md.

Wait for the answer. Accept any of:

- A URL to a live product or brand.
- One or more image attachments.
- A copy-pasted design prompt.
- A brand or product name.
- An explicit "no reference - please infer."

---

## Step 2a - Reference-driven path (FR-DESIGN-01, FR-DESIGN-05)

If the user supplied a reference:

- **Extract, do not fabricate.** Colors, typography, spacing, and radius values MUST come from the reference. If a value cannot be determined from what you were given, mark it as `TBD` and add it to the Open Questions checklist. **Do not invent brand colors.** This is the load-bearing rule of FR-DESIGN-05.
- Identify at minimum three colors (primary surface, primary text, accent), one display-family and one body-family for typography, an 8px-based spacing scale, and radius conventions for buttons/cards/inputs/tags.
- Capture the reference's "style statement" in one paragraph: what does the surface treatment, type pairing, color discipline, and rhythm say together?

---

## Step 2b - Inferred path (FR-DESIGN-02)

If no reference is supplied:

- Read `claude/srs.md` to understand product, personas, and constraints.
- Propose ONE design direction with a one-paragraph rationale (e.g. "financial dashboards for solo operators call for high-contrast neutrals with a single warm accent - the primary user is scanning, not exploring").
- Choose defaults: a neutral surface, a legible body typeface (System UI or Inter as fallback), a display typeface that fits the rationale, an 8px spacing scale.
- Confirm the direction with the user in one exchange before writing.

---

## Step 3 - Write `design/design.md` (FR-DESIGN-03)

Populate the template's canonical sections in this order:

1. **Style Statement** - one paragraph capturing the design's voice.
2. **Tokens - Colors** - table with name, hex, CSS variable, and role for every color.
3. **Tokens - Typography** - display and body families with substitutes, weights, sizes, line-heights, letter-spacings. Include the type scale (caption through display).
4. **Tokens - Spacing & Shape** - the 8px base scale plus border-radius per element and shadow tokens.
5. **Layout** - page max-width, section gap, card padding, element gap.
6. **Components** - one subsection per component (button, card, input, tag, etc.) with a paragraph describing surface, type, spacing, and any non-obvious treatment.
7. **Do's and Don'ts** - two short lists.
8. **Surfaces** - level 0/1/2 table (canvas, elevated, emphasis) with hex and purpose.
9. **Imagery & Motion** - brief statement on how illustrations, photos, and motion are used or deliberately avoided.
10. **Quick Start - CSS Custom Properties** - a `:root { --token: value; }` block ready to paste.

Use the header block from `templates/design/design.md` (project, theme, inspiration, last-updated) as-is.

---

## Step 4 - Generate preview assets (FR-DESIGN-04)

Place any generated HTML/CSS/JS reference pages under `design/preview/`. Typical outputs:

- `design/preview/index.html` - the landing preview showing tokens applied to a marketing surface.
- `design/preview/component-gallery.html` - one section per component.

Preview HTML MUST use only the CSS custom properties defined in the Quick Start block of `design.md` - no inline colors, no hardcoded pixel values that duplicate a token.

If the user does not want preview assets, skip this step and note the choice in Open Questions.

---

## Refusal clause (FR-DESIGN-05)

If a reference was supplied and you cannot extract a required value from it - most commonly a brand color that is not present in a screenshot - **refuse to invent the value**. Instead:

- Mark the token as `TBD` in `design.md`.
- Add an Open Question row: `- [ ] Brand color for {role}: reference did not include a definitive value.`
- Ask the user for the value in your next message.

**Never fabricate a color value the user did not provide when they supplied a reference.**

---

## Completion summary (NFR-USE-01)

When `design/design.md` is written, print one line summarising what was produced plus a one-line next-step hint:

> Wrote design/design.md ({N} color tokens, {N} type tokens, {N} components) and design/preview/. Next: run `/spec-plan` to break the build into 8-10 stages.

---

## Student persona note (NFR-USE-03)

If the project's `CLAUDE.md` is scaffolded for the **student** persona, append after the completion summary:

> Why this step? A design system is the shared vocabulary between "what the product feels like" and "what the code renders." Locking it in now stops every downstream feature cycle from re-negotiating colors and spacing.

---

## What NOT to do

- Do not write application code.
- Do not fabricate brand colors when a reference is supplied.
- Do not put design tokens anywhere except `design/design.md`'s canonical sections.
- Do not skip the Quick Start CSS block - downstream feature code depends on it.
