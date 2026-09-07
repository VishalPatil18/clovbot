# Project Context - Compressed Snapshot

> Single source of truth for "what exists right now." Updated at the end of every feature cycle by `/spec-feature` and reconciled by `/spec-sync`.
>
> Read this file before answering questions about project state. Do not re-derive from source.

| Field                | Value            |
| -------------------- | ---------------- |
| Snapshot date        | _<YYYY-MM-DD>_   |
| Current stage        | _<from plan.md>_ |
| Last feature shipped | _<feature name>_ |

---

## 1. What exists

_<Bullet list of shipped capabilities. One line each. Link to feature entries in `features.md`.>_

- _<capability 1>_ - [features.md#anchor](./features.md)
- _<capability 2>_

## 2. What works (verified)

- _<verified flow 1>_
- _<verified flow 2>_

## 3. What's known broken

- _<known issue 1>_
- _<known issue 2>_

## 4. What's next

- _<next stage from plan.md>_
- _<next feature in queue>_

## 5. Active environment

- **Branch:** _<git branch>_
- **Local services running:** _<list>_
- **Required env vars set:** _<list>_

## 6. Recent design decisions

> Most recent first. For full history, see [`design-decisions.md`](./design-decisions.md).

- _<YYYY-MM-DD>_ - _<decision summary>_

## 7. File map

| Area            | Path     | Owner skill        |
| --------------- | -------- | ------------------ |
| Frontend entry  | _<path>_ | _<skill or human>_ |
| Backend entry   | _<path>_ |                    |
| Database schema | _<path>_ |                    |
| Test suite      | _<path>_ |                    |
