# Software Requirements Specification

> Built by `/spec-requirements`. Treat as frozen once approved. Re-run the skill to amend.

| Field        | Value          |
| ------------ | -------------- |
| Project      | _<name>_       |
| Version      | 0.1.0          |
| Status       | Draft          |
| Last Updated | _<YYYY-MM-DD>_ |

---

## 1. Overview

_<One paragraph: what problem this product solves and for whom.>_

## 2. Personas

| Persona  | Profile          | Primary Need       |
| -------- | ---------------- | ------------------ |
| _<name>_ | _<who they are>_ | _<what they need>_ |

## 3. Jobs To Be Done

- _<job 1>_
- _<job 2>_

## 4. Functional Requirements

<!-- Render any data schema or structured config as a fenced ```yaml block (flat; nesting deeper than 3 levels -> YAML), not prose. -->

| ID    | Requirement            |
| ----- | ---------------------- |
| FR-01 | _<must-have behavior>_ |
| FR-02 | _<must-have behavior>_ |

## 5. Acceptance Scenarios

<!-- Given/When/Then per load-bearing FR. Include at least one edge/failure scenario for each, not just the happy path. -->

```gherkin
Scenario: [FR-01] <success case>
  Given <starting state>
  When <the action>
  Then <the observable outcome>

Scenario: [FR-01] <edge or failure case>
  Given <edge starting state>
  When <the action>
  Then <the safe, expected failure outcome>
```

## 6. Non-Functional Requirements

| ID          | Requirement             |
| ----------- | ----------------------- |
| NFR-PERF-01 | _<performance budget>_  |
| NFR-SEC-01  | _<security constraint>_ |
| NFR-USE-01  | _<usability bar>_       |

## 7. Hard Constraints

- _<e.g., must run on-device>_
- _<e.g., must integrate with X>_

## 8. Explicit Non-Goals

- _<we are NOT building Y>_
- _<we are NOT supporting Z in v1>_

## 9. Success Metric

_<One sentence: how we know this worked.>_

## 10. Open Questions

- [ ] _<question 1>_
- [ ] _<question 2>_

> No skill downstream of Requirements may proceed while load-bearing open questions remain unresolved.
