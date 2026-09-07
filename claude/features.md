# Features Log

> Append-only log of features. Each entry is the final shape of one feature cycle.
>
> Written by `/spec-feature`. Read by `/spec-docs` and `/spec-bug`.

---

<!-- Template for each feature. Copy below this line for new features. -->

## Feature: _<feature name>_

| Field            | Value                 |
| ---------------- | --------------------- |
| Shipped          | _<YYYY-MM-DD>_        |
| Cycle            | _<sequential number>_ |
| Stage of plan.md | _<stage number>_      |
| Owner            | _<user or claude>_    |

### Phase 1 - Requirements

_<Cross-questioning transcript summary. The questions asked and the answers received.>_

### Phase 2 - Architecting

**Options considered:**

1. _<option A>_ - pros / cons
2. _<option B>_ - pros / cons

**Chosen:** _<A or B>_ - _<one-line rationale>_

### Phase 3 - Product Specs

- **UI:** _<screens, components>_
- **UX flow:** _<steps>_
- **Frontend entities:** _<list>_
- **Backend entities:** _<list>_
- **DB schema:** _<tables / collections>_

### Phase 4 - Tech Specs

- **Frameworks:** _<chosen + rejected>_
- **Languages:** _<chosen>_
- **Deployment:** _<target>_
- **Data store:** _<chosen + rejected>_

### Phase 5 - Planning

| Sub-stage | Goal     | Acceptance   |
| --------- | -------- | ------------ |
| 1         | _<goal>_ | _<criteria>_ |
| 2         | _<goal>_ | _<criteria>_ |

### Phase 6 - Writing Code

- **Files touched:** _<list>_
- **Tests added:** _<list>_
- **Refactor scope:** _<files cleaned by `/spec-refactor`>_
- **Memory updates applied:** [ ] context.md [ ] design-decisions.md [ ] learnings.md [ ] CHANGELOG.md

---
