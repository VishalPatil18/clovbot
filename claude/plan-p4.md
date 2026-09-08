# Build Plan - P4 (v1.3)

> Scope: `claude/srs.md` §8 v1.3 items, and `docs/ideas.md` §8 entries P4-01 through P4-07.
>
> **Depends on plan-p3.** Stage 2 in particular cannot ship without the authenticated tier from P2 and, given what it opens up, should not ship without P3's controls either.
>
> Five stages, ordered by leverage rather than by the P4 numbering. Each stands alone and none depends on another, so this plan can be entered at any stage or abandoned after any stage.
>
> **Effort bands:** **S** ≤ 3h · **M** 4-8h · **L** 9-14h.

| Field | Value |
| --- | --- |
| Plan version | 1.0.0 |
| Source | `claude/srs.md` §8, `docs/ideas.md` §8 |
| Last Updated | 2026-09-07 |
| Total estimate | ~52h across 5 stages |

---

## Stage Map

| # | Stage | Deliverable | Effort | Cumulative |
| --- | --- | --- | --- | --- |
| 1 | Semantic cache | Two-tier cache with a proven-safe similarity threshold | M | ~7h |
| 2 | Member document upload | Auth-gated upload answering from member-supplied documents | L | ~19h |
| 3 | Full corpus expansion | All eleven states, both contract types | L | ~32h |
| 4 | Spanish | Corpus, interface and eval in a second language | L | ~45h |
| 5 | Deferred interface cluster | Rotating tips, coach marks, appearance customization | M | ~52h |

**Ordering logic.** Stage 1 is cheapest and lowest risk. Stage 2 carries the most interesting engineering and the most risk, so it sits before the two large corpus stages rather than after them. Stage 5 is last because it is the lowest-value work in the entire project, by the assessment recorded in `docs/ideas.md`.

---

## Stage 1 - Semantic cache

- **Goal:** Serve repeated questions without a second model call, without ever serving a near-miss as a hit.
- **Scope in:** Exact-match tier keyed on normalised question plus plan context. Semantic tier behind it at a high similarity threshold. Invalidation on any corpus snapshot change. Cache hit and miss recorded on every turn.
- **Scope out:** Caching authenticated member answers. Cross-member cache pollution is not a risk worth taking for a latency gain.
- **Acceptance criteria:**
  - [ ] An identical repeated question is served from the exact tier with no model call, asserted by call counting.
  - [ ] A paraphrase above the threshold is served from the semantic tier.
  - [ ] **Two questions differing only in a benefit that carries a different copay never share a cache entry**, asserted with a hand-built adversarial pair. This is the test the whole stage exists for.
  - [ ] A corpus re-ingest producing a new snapshot id invalidates every entry.
  - [ ] Cache hits carry the same citations as the original answer.
  - [ ] Authenticated answers are never cached, asserted directly.
  - [ ] Hit rate is reported alongside the existing eval metrics.
  - [ ] The threshold value and the evidence behind it are recorded, since D-011's performance rationale is unverified.
- **Test plan:** Call-counting integration tests for both tiers. The adversarial near-miss pair is the primary test; it should be built by hand from two genuinely similar benefit questions with different amounts. Invalidation test across a re-ingest. Negative test on the authenticated path.
- **Effort:** M
- **Exit signal:** A repeated question returns instantly, and two similar copay questions provably never collide.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 2 - Member document upload

- **Goal:** Let a signed-in member ask about a letter, bill or explanation of benefits they were sent.
- **Scope in:** Upload inside an authenticated session only. Type allowlist, size cap, page cap, per-session upload limit. Parse, chunk, embed, store scoped to that member. Retrieval alongside plan documents with filename and page citations. Member-visible file list with real deletion and a retention timer. Plain-language warning before upload.
- **Scope out:** Any upload path for signed-out visitors. Any interpretation of a denial - see the first acceptance criterion.
- **Acceptance criteria:**
  - [ ] Upload is unreachable without a session, asserted at the API layer rather than only hidden in the interface.
  - [ ] **A denial letter uploaded with "is this right?" produces an explanation of the document and the appeals process, and no judgement on the denial.** This extends FR-21 to a new input and is the regulatory risk this feature carries.
  - [ ] **A crafted document containing instructions to ignore citation rules does not change citation behaviour**, asserted with a hostile fixture. Upload turns a closed corpus into an open one; this is the threat that arrives with it.
  - [ ] Uploaded content is fenced and labelled as member-supplied in the prompt, never presented as instruction.
  - [ ] Files outside the type allowlist are rejected before parsing.
  - [ ] Oversized files and excess page counts are rejected with a clear message.
  - [ ] Uploaded documents are retrievable only within the uploading member's session, asserted cross-member.
  - [ ] Delete removes the file and its chunks, verified by direct storage and index inspection rather than by the interface reporting success.
  - [ ] The retention timer purges files, verified with clock manipulation.
  - [ ] The pre-upload warning is visible and meets the accessibility floor.
- **Test plan:** API-layer authorisation test with the interface bypassed. The denial-letter case and the injection case are the two that gate this stage; both need real fixtures, not mocks. Cross-member retrieval isolation test. Deletion verified against storage and index directly. Clock-manipulation test for retention. Malformed-file fuzzing across the allowlist, since arbitrary file parsing is where file-handling bugs live.
- **Effort:** L
- **Exit signal:** A signed-in member uploads a bill, asks what it means, gets a cited explanation, deletes it, and it is verifiably gone.
- **Status:** [ ] not started · [ ] in progress · [ ] done

**Highest-risk stage in the project.** It crosses the coverage-determination boundary and opens the corpus to untrusted content simultaneously. The four conditions in D-028 are acceptance criteria here, not guidance.

---

## Stage 3 - Full corpus expansion

- **Goal:** Cover every Clover service area and both contract types.
- **Scope in:** Ingest across all eleven states, HMO and PPO. Plan selector listing every real plan. Golden set extended with cross-service-area cases. Ingest performance work if the pipeline no longer completes in reasonable time.
- **Scope out:** Nothing deferred.
- **Acceptance criteria:**
  - [ ] Every service area is indexed with a distinct contract and plan identifier.
  - [ ] The plan selector lists real plans with no placeholders.
  - [ ] Retrieval never crosses service areas, asserted on a sample spanning several.
  - [ ] Faithfulness stays at or above 0.90 on the expanded golden set.
  - [ ] Refusal rate does not rise above the 20% band as the corpus grows.
  - [ ] Retrieval p95 stays under 300ms at full corpus size.
  - [ ] Full ingest completes and remains idempotent at scale.
  - [ ] A documented sampling approach replaces hand-verification of every answer, since exhaustive verification is no longer possible.
- **Test plan:** Cross-service-area leakage tests on a sample rather than exhaustively. Latency regression at full index size, which is where HNSW parameters may need revisiting. The sampling approach is itself a deliverable, since the credibility of the eval numbers now rests on it.
- **Effort:** L
- **Exit signal:** A member in any of the eleven states gets an answer scoped to their own service area.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 4 - Spanish

- **Goal:** Serve Spanish-speaking members, replacing the FR-24 refusal with an answer.
- **Scope in:** Spanish plan documents ingested where Clover publishes them. Spanish interface strings. Language detection routing to the correct corpus. Spanish voice input and output. Golden set extended with Spanish questions and Spanish-sourced expected answers.
- **Scope out:** Machine translation of English documents. A translated benefits amount is an uncited claim wearing a citation.
- **Acceptance criteria:**
  - [ ] A Spanish question returns a Spanish answer citing a Spanish source document.
  - [ ] **No answer is produced by translating an English document**, asserted by source-language checking on every citation. Translation would break the citation contract silently.
  - [ ] Where no Spanish source exists, the assistant refuses in Spanish and offers the human path.
  - [ ] Language detection is correct on a mixed-language test set.
  - [ ] Voice input and output work in Spanish.
  - [ ] The Spanish golden set has hand-pinned expected answers, held to the same standard as the English set.
  - [ ] Faithfulness at or above 0.90 in both languages, reported separately rather than averaged.
- **Test plan:** Parallel golden sets scored independently. Source-language assertion on every Spanish citation, which is the test preventing the silent-translation failure. Mixed-language detection set including code-switching, which is common in this population.
- **Effort:** L
- **Exit signal:** A Spanish question returns a Spanish answer citing a Spanish document, and never a translated one.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Stage 5 - Deferred interface cluster

- **Goal:** Ship the three reinstated interface items with the conditions that make them non-harmful, per D-028.
- **Scope in:** Rotating tips during processing. First-run coach marks. Appearance customization.
- **Scope out:** Nothing.
- **Acceptance criteria:**
  - [ ] Rotating tips carry a visible pause, stop or hide control, satisfying WCAG 2.2.2.
  - [ ] Rotating tips never occupy the region where the answer renders, asserted by layout test.
  - [ ] Tips do not appear at all when time to first token is under the latency budget, since there is no wait to fill.
  - [ ] Coach mark dismiss targets are at least 44x44 CSS px.
  - [ ] Focus moves into and back out of the coach mark overlay correctly, satisfying WCAG 2.4.11.
  - [ ] Coach marks are skippable on the first step.
  - [ ] Coach marks are re-openable from the help panel, so the tour is not one-shot.
  - [ ] Appearance choices persist and every combination still meets WCAG AA contrast, asserted across the full set rather than the default.
  - [ ] Accessibility scan stays clean with every feature enabled.
- **Test plan:** Layout assertion that the tips region and the answer region do not overlap. Focus-order test through the coach mark overlay. Contrast assertion computed across every appearance combination, since a theme picker that permits a failing combination is worse than no picker. Full accessibility regression with all three enabled.
- **Effort:** M
- **Exit signal:** All three ship, and the accessibility scan is as clean with them on as with them off.
- **Status:** [ ] not started · [ ] in progress · [ ] done

---

## Completion Checklist

- [ ] Stage 1 - Semantic cache
- [ ] Stage 2 - Member document upload
- [ ] Stage 3 - Full corpus expansion
- [ ] Stage 4 - Spanish
- [ ] Stage 5 - Deferred interface cluster

---

## Cross-Cutting Risks

| Risk | Impact | Mitigated by | Residual |
| --- | --- | --- | --- |
| Cache serves a near-miss on a cost question | A wrong copay presented as a cached correct answer | Stage 1 adversarial pair test and a high threshold | The threshold value rests on judgement; D-011's repeat-rate premise is unverified |
| Prompt injection through an uploaded document | Citation contract bypassed by member-supplied content | Stage 2 hostile fixture, fencing, and the P1 injection case | Largest attack surface in the project; a closed corpus becomes open |
| Upload invites coverage-determination questions | Regulatory. "Is this denial right?" arrives attached to the letter | Stage 2 acceptance criterion extending FR-21 to uploads | Cannot be eliminated, only refused consistently |
| Correctness unverifiable at full corpus scale | Eval numbers quietly stop meaning anything | Stage 3 documented sampling approach as a deliverable | Confidence in the numbers drops; saying so is the mitigation |
| Spanish answers produced by translation | An uncited claim wearing a valid-looking citation | Stage 4 source-language assertion on every citation | Refusing where no Spanish source exists is the correct, less impressive outcome |
| Appearance customization permits a failing contrast combination | An accessibility regression shipped as a feature | Stage 5 contrast assertion across every combination | Argues for a small fixed palette rather than free choice |
| Interface cluster consumes time better spent elsewhere | Lowest-value work displacing higher-value work | Positioned last deliberately | It is here by decision after being argued out; the ordering is the remaining mitigation |
