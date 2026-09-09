# Future work

> What is next, why it matters, and what it would cost. Ordered by what a reviewer would ask for first.

---

## 1. Logging and monitoring

**Where it stands.** Every turn is already recorded in `turns`: the redacted question, the retrieval path and the reason the router chose it, the chunk ids returned, the outcome, the refusal trigger, the provider, and per-stage latency. Every authenticated read is recorded in `member_access_log` down to the column and row. `npm run insights` prints a summary and `npm run reproduce -- <turn-id>` replays an answer from its recorded chunks.

So the data exists. What is missing is everything that turns records into an operational picture.

### Structured logs with a trace id

Today the API line, the retrieval query and the model call are separate `console.log` calls with nothing tying them together. One field - a trace id minted per turn and carried through - makes a slow answer diagnosable instead of guessable. This is the cheapest item on this page and the one that unblocks the rest.

### Metrics worth watching

| Metric | Why this one |
| --- | --- |
| Faithfulness over a rolling window | CI measures it on 66 fixed cases. Production asks questions nobody wrote down. |
| Refusal rate, split by trigger | A spike in `below_floor` means the corpus has a gap. A spike in `C-01` means members are asking for determinations, which is a content problem, not a bug. |
| p95 time to first token | The number a member feels. NFR-PERF-02 sets 2000ms unthrottled and nothing watches it after deploy. |
| Provider fallback rate | The voice chain degrades silently by design. How often it degrades is a budget question. |
| **Top unanswered questions** | The single most valuable output. It is the roadmap for what to index next, and it is the thing a plan would act on first. |

### Alerting, and a view

The four eval gates run on pull requests and nothing watches the deployed service for the same drift. The gates already exist; they need a schedule and a destination. A read-only view over the turn log would make refusal spikes and router drift visible without a SQL client.

### Tamper-evidence

Named in [real-phi.md](./real-phi.md) and worth repeating here: the access log is append-only **from the application** and not from the operator. With real data it wants a hash chain or an append-only sink outside the same database. Free-tier options exist; this is a design decision, not a budget one.

---

## 2. Agentic handoff to a human agent

**Where it stands.** After two consecutive refusals the assistant offers a callback carrying the question, the plan and the documents already searched. That is a form. The member still repeats themselves to whoever picks up.

The goal is to carry the **conversation** across rather than a summary of it, and to keep the assistant useful after the transfer instead of stepping out of the room.

### An MCP server over the same retrieval

Expose the retrieval the assistant already uses - plan-scoped hybrid search, the typed drug lookup, the citation renderer - as an MCP server the agent's own console can call.

The point is not that the agent gets a chatbot. It is that the agent sees **the exact chunks the member was shown**, so nobody re-derives what the assistant already found, and the answer the agent gives cites the same document the member is looking at. Divergence between what the bot said and what the agent says is the thing that destroys trust in both.

### Live conversation handoff

The transcript, the citations already given, the plan context, the router's reasoning and the refusal trigger arrive with the transfer. The person opens on the member's actual question rather than "how can I help you today", which is the moment members describe as having to start over.

### The assistant staying in the room

After the transfer, the assistant becomes a tool the agent drives rather than a participant. The agent asks for the remaining deductible; the assistant returns it with its citation; the agent decides what to say and says it.

This ordering is not stylistic. **CMS-4201-F requires that determinations be individualised and made by a person**, and an assistant that informs an agent who then decides stays firmly on the correct side of that line, while an assistant that talks directly to a member about a coverage decision does not. The agentic version is more capable *and* more defensible, which is unusual enough to be worth saying.

### The gate on writes

An emailed code proves control of an inbox. That is adequate for reads of synthetic data and nowhere near adequate for changing a real record: an address change, an ID card reissue, anything that alters what the plan believes.

**No agentic write should ship before identity proofing is fixed.** That gap is stated explicitly in [real-phi.md](./real-phi.md), and it is the reason this section stops at reads.

---

## 3. Security hardening beyond P3

| Item | Why it is still open |
| --- | --- |
| Row-level security keyed to something the application cannot set | Policies filter on a setting application code puts there. Trust moved from every query into one function; it did not leave the application. |
| Staff roles and break-glass | Access control here is member-versus-member. There are no support, engineering or analyst roles, because there is no staff. |
| TLS enforced by the server | Measured, and it is a client-side convention: the pooler accepts a plaintext connection, and the pooler-to-database hop has no TLS at all. |
| Zero data retention on the model tier | Not configured and not verified. Every prompt carries retrieved chunks, and under the authenticated tier those include record fields. |
| BAAs for the three vendors that receive answer content | Spoken answers go to a voice vendor, recorded questions to speech-to-text, sign-in mail through Resend. None is covered by the model vendor's agreement. |

---

## 4. Product

- **Contextual follow-up suggestions** after an answer. Built and not shipped: measurement showed the prompt change moved faithfulness, so it waits for a way to add it without touching the answering prompt.
- **The answer card** with the amount dominant. Same reason, recorded as D-069.
- **Provider search.** Deliberately absent. The corpus has no real provider directory, and precise structured search over invented rows produces a confident wrong answer about a member's own doctor. It needs real data before it needs code.
- **A third contract**, to prove plan scoping at a scale where a mistake is not obvious by inspection.

---

## 5. Accessibility

- **A keyboard and screen-reader pass over the login flow.** Static assertions cover target size, contrast, focus and the pasteable code field. None of that is the same as a person using it with a screen reader, and the login is the highest-friction surface in the product for a 65+ audience.
- **Throttled real-device latency.** Current numbers are unthrottled desktop, which is not the network this audience is on.
- **Spanish help-panel prose.** The panel chrome, answers, refusals and guardrails are all Spanish; the help panel's longer explanatory copy is not yet.
