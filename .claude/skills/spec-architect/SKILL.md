---
name: spec-architect
description: Design or restructure application architecture - module, service, and layer boundaries. Use when starting a new project or feature area, deciding monolith vs services, defining layers (transport/service/data), or when the user says "architecture", "how should I structure this", "design the system", or invokes `/spec-architect`. Reads the SRS and memory layer first, proposes boundaries with tradeoffs, and records every non-obvious choice in `claude/design-decisions.md`.
---

# spec-architect

Design the shape of the system: what is allowed to know about what. Good architecture makes next month's change cheap; bad architecture makes every change touch everything. Optimize for cost-of-change, not diagrams.

This skill proposes structure; it does not write feature code. Hand implementation to `/spec-feature`. For UI/token design use `/spec-design`; this skill owns module/service/data boundaries.

---

## Read first (spend tokens on signal)

- `claude/srs.md` - the frozen requirements and hard constraints the architecture must satisfy.
- `claude/context.md` **Current State** - existing stack, layout, and locked decisions. Do not contradict without reason.
- `claude/design-decisions.md` - prior architectural choices and their rationale.
- Only the modules named by the request. Do not scan the whole repo.

## The method: boundaries from change, not from nouns

### Step 1 - List the forces before drawing anything

Write down, from the SRS: the 3-5 most likely future changes (new payment provider? new tenant type?), team size, and hard constraints (compliance, latency, budget). Architecture answers these. Without them you are decorating. If the SRS does not state them, ask - do not invent.

### Step 2 - Draw boundaries where change is isolated

Things that change together live together; things that change for different reasons get a boundary. "User service / Order service" split by noun is often wrong; "pricing rules change weekly, ledger rules never" is a real boundary.

### Step 3 - Make dependencies one-way

Pick a direction (e.g. transport -> service -> data; domain never imports web) and enforce it. A lower layer importing an upper layer is a defect even when the compiler allows it.

### Step 4 - Define each boundary as a contract

For every module state: what operations, what data shapes, what errors, what invariants the caller may rely on. If you cannot state a module's contract in five lines, the boundary is wrong.

## The default that is usually right

A **modular monolith** with strict internal boundaries, one database, boring synchronous calls - until measured evidence (scaling limits, team contention, isolation requirements) demands otherwise. Distribution turns function calls into network errors, partial failures, and eventual consistency. Take that cost only when paid for.

Signs a service split is earned: independent scaling profiles, independent deploy cadence blocking teams, a hard fault-isolation or security boundary. "It might scale someday" is not a sign.

## Layering rules (server apps)

- **Transport** (routes/controllers): parse, authenticate, authorize, call one service function, shape the response. Zero business logic - an `if` about money or state here means move it down.
- **Service**: all business logic and transaction boundaries. One service function = one use case = one transaction. Services do not know HTTP exists.
- **Data**: models/queries. No business decisions.
- **Cross-cutting** (config, errors, auth primitives): a core module both sides import; it imports neither.
- **External systems** (SMS, email, payments, storage) go behind an adapter interface with a mock implementation, selected by config. Highest-ROI habit: testability, dev-without-credentials, and provider swaps for free.

## Anti-patterns to refuse

- **Speculative generality**: plugin systems, generic "engines", abstraction layers with one implementation. YAGNI is an architecture rule.
- **Distributed monolith**: services that must deploy together or share tables - all the cost of microservices, none of the benefit.
- **Business logic in the database or the UI** - logic hidden where tests and reviews do not look.
- **The Big Rewrite**. Strangle instead: draw the boundary, put new code behind it, migrate callers incrementally, delete last.

## Review checklist for a proposed design

- [ ] For each component, you can state what it must NOT know about.
- [ ] The top 3 likely changes each touch <= 2 components.
- [ ] Each invariant is enforced exactly once, at the boundary that owns it.
- [ ] Every arrow crossing a process boundary has a failure answer (timeout, retry, degraded mode).
- [ ] Exactly one source of truth per piece of state; every cache names its invalidation story.
- [ ] A new developer could find where feature X's code goes without asking.

## Output and memory update

1. Present 1-3 architecture options with explicit tradeoffs, then a recommendation tied to the forces from Step 1.
2. For every non-obvious choice, append a 5-line ADR to `claude/design-decisions.md`: _context -> options considered -> decision -> consequences accepted._ Six months on, this stops someone "fixing" the design because nobody recorded why it is shaped this way.
3. Update `claude/context.md` **Current State** (architecture) and add a Session History entry.

## Red flags

- A design where everything may know everything (there is no architecture).
- A "layer" that is one-line pass-through delegation adding indirection, not clarity.
- A boundary drawn by noun with no change-force behind it.
- Microservices proposed with no measured scaling or isolation evidence.
