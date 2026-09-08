# UI Mocks - how to use these

Two Claude Design canvas artboards plus their runtime. **Read this before building any UI surface.**

| File | Covers | Used by |
| --- | --- | --- |
| `Landing Page.dc.html` | Clover-faithful marketing page: nav, hero, plan cards, LiveHealthy, testimonials, footer | plan-p1 Stage 7 (host page) |
| `Chatbot Page.dc.html` | Full assistant: sidebar, header, empty state, message thread, citations, plan picker, refusal, voice mode, composer | plan-p1 Stages 7, 8, 9 · plan-p2 Stages 3, 4, 6 |
| `support.js` | Canvas runtime | neither - not shipped |

## Format

These are `.dc.html` canvas files using `<x-dc>`, `<sc-if>`, `<sc-for>` and a `DCLogic` class. **Not React, not Next.js, not liftable markup.** Treat them as a visual and behavioural reference: take the layout, the copy, the state transitions and the token usage; rewrite the implementation.

The inline styles do map cleanly onto `../DESIGN.md` tokens. `#0f3e17` is Forest Ink, `#e1f4df` Keylime Wash, `#cfe7d3` Mint Veil, `#b1dbb8` Sage Mist, `#b6ced5` Slate Hush, `#fffefc` Cream Paper, `#efeeeb` Border Mist, `#222222` Charcoal. Build against the tokens, not the hex values.

## What the mock gets right - preserve these

Each of these is a requirement rendered correctly. Do not simplify them away.

| Behaviour in the mock | Requirement |
| --- | --- |
| Cost question mid-conversation returns plan chips ("Clover Choice PPO", …) before answering. The empty state does **not** ask for a plan | FR-10, D-022 lazy plan context. This is the subtlest thing in the mock and the easiest to get wrong |
| Citation chip reads "Summary of Benefits 2026 · H5141-001 · p. 7" | FR-06, all four provenance fields present |
| Refusal renders what it *did* find, then the callback block, then the phone | FR-22 |
| "Talk to a person" appears in the sidebar panel **and** the footer, in every state | FR-13 |
| Footer: "An assistant, not a clinician. It answers only from plan documents and never decides coverage." | FR-15 |
| "Did this answer your question? Yes / No" under answered turns only | FR-27 |
| Header: "Not signed in · no member data" | NFR-SEC-01, stated to the member rather than assumed |
| Voice mode: 112px mic, "Hold to talk, or tap to start and tap to stop. The transcript is editable before it sends." | FR-17, FR-18 |
| The appeals card answers the process **and** adds "I can explain the process, but I cannot comment on any specific denial" | The A-11 / C-01 near-miss, handled in one card |
| `min-height:44px` on nav rows, plan chips, composer buttons | NFR-A11Y-02 |

## Conflicts with frozen requirements - resolve before building

Six. The first is the largest and affects every screen.

### 1. Type scale is below the accessibility floor

`claude/srs.md` NFR-A11Y-03 requires **body text at 18px minimum**. The chatbot mock uses:

| Size | Occurrences | Where |
| --- | --- | --- |
| 18px | 5 | message bubbles, composer input, voice status |
| 16px | 3 | composer icon glyphs |
| 14px | 18 | sidebar nav, recent items, plan chips, card titles, callback copy |
| 12px | 8 | header chips, mode toggle, feedback labels |
| 11px | 5 | citation chip, disclaimer, hours |
| 10px | 4 | eyebrow labels, "Not signed in" |

The message thread meets the floor. Almost nothing else does, **including the citation chip at 11px** - which is the trust surface the entire product rests on, set in the smallest type on the screen for an audience with declining eyesight.

**Resolution required before Stage 7.** Either the mock's scale is lifted to meet NFR-A11Y-03, or the NFR is amended with a stated rationale. Building the mock as drawn will fail Stage 7's acceptance criteria.

### 2. The phone number is real-shaped

Mock uses `1-888-778-1478` in three places. D-026 decided on an obviously-fake placeholder specifically so a public unaffiliated deploy cannot route real calls to a real call centre. Replace with a 555 number, or revisit D-026.

### 3. Support hours are unsourced

"8am–8pm, 7 days" appears in the sidebar. `claude/srs.md` §10 lists Clover's actual member services hours as an open question. Do not ship a number nobody sourced.

### 4. The attach button is in the signed-out composer

The `＋` control next to the composer is document upload. P4-07 is **auth-gated** and lowest priority. As drawn, a guest can attach a file. Remove it from the P1 build; reintroduce inside the authenticated session at P4.

### 5. The sidebar ships P2 features on a P1 surface

"Search conversations" and the "Recent" list are conversation history, which is plan-p2 Stage 4. Search across conversations is not specified anywhere. Build Stage 7 without them, or move them forward deliberately.

### 6. Plan names are invented

"Clover Choice PPO", "Clover Value PPO", "Clover Simple HMO" are placeholders. Real plan benefit package names come from the Stage 1 corpus fetch. `H5141-001` and `New Jersey` in the header do match the working default and the fixture corpus.

## Content in the mock that is genuinely useful

The six prompt cards in `bank` are a reasonable first draft of FR-14's suggested starter questions, and they map onto `docs/call-drivers.md` bucket A drivers: hearing aid (A-01), specialist copay (A-02), formulary tier (A-04), provider search (A-07), OTC allowance (A-08), appeals process (A-11). Their answer text and citations are **illustrative, not verified** - every one needs hand-checking against a real source document before it enters the golden set.
