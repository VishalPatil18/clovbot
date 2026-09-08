# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Ask a question, get a cited answer.** `npm run ask -- "what is the specialist copay" --plan 004` returns the amount from the plan's own Summary of Benefits, with the document, contract, plan, plan year and section it came from. Asking the same question against plan 007 returns that plan's different amount, because the two plans are indexed separately.
- **Answers say when they do not know.** A question the plan documents do not cover gets a plain statement that it was not found, rather than a guessed amount.
- **Identifiers are removed before anything is stored.** Typing a member id, date of birth or social security number into a question leaves the question intact and the identifier gone.
- **The plan document corpus builds from one command.** Fetches the 2026 Clover PPO documents for Hudson County, New Jersey - Evidence of Coverage, Summary of Benefits, annual notice of change, formulary and pharmacy directory, plus public corporate pages - converts them to text, and writes a report naming anything it could not retrieve.

### Changed

- **Working agreement.** `CLAUDE.md` is now a behavior contract instead of a template: spec before code, TDD, zero PHI in v1, cite-or-refuse answers, design forks go to the human, no invented Clover/Medicare/CMS facts, ask before adding a dependency. Cut from 399 lines to 94 so it costs less context each session. Stale scaffold sections (unfilled environment, another repo's stack notes) are gone.

### Fixed

- _<bug fixes; populated by `/spec-bug`>_

### Removed

- _<removed capabilities>_

### Security

- _<security-relevant changes>_

---

## [0.1.0] - _<YYYY-MM-DD>_

### Added

- Initial project scaffold via Spec-Driven Development Starter Kit.
