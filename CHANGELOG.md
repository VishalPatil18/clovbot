# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- _<new capabilities>_

### Changed

- _<changed behavior>_

### Fixed

- _<bug fixes; populated by `/spec-bug`>_

### Removed

- _<removed capabilities>_

### Security

- _<security-relevant changes>_

---

## [1.0.0] - 2026-09-08

Member-facing plan-document assistant: cited answers, guardrails, voice, and a public deploy.

### Added

- **You can talk to it instead of typing.** Hold the microphone button and speak, or tap once to start and tap again to stop. Both work, always.
- **It shows you what it heard before it answers**, so you can fix a word it got wrong rather than getting an answer to the wrong question.
- **Answers are read aloud and written down at the same time.** The text never disappears, so you can re-read it or check where it came from. You can replay or stop the audio.
- **If the usual voice is unavailable, it says so** and carries on in another voice rather than going silent.
- **Whether you prefer talking or typing is remembered** for next time.
- **Questions that need a person now go to a person.** Coverage decisions, medical questions, plan choices, complaints, fraud reports and record changes are declined with the reason, not answered badly.
- **If you describe an emergency, the assistant stops and tells you to call 911** instead of looking anything up.
- **After two answers it could not give, it offers to hand you over** rather than inviting you to try again.
- **The handover carries your question, your plan and the documents already searched**, so you do not repeat yourself. Nothing is sent anywhere in this case study.
- **A question in another language gets a plain English answer saying so**, and the number to call, rather than a half-translated guess.
- **There is now something to use.** A Clover-styled page with an assistant you can open from the bottom right, or open full screen on its own page.
- **You can start asking straight away.** No sign-in, no setup, and no plan to choose first. The assistant asks which plan you are on only when the answer depends on it, and remembers it for the rest of your visit.
- **Six suggested questions** to start from, drawn from what members phone about most.
- **"Talk to a person" is on screen at all times**, including while an answer is being written.
- **Text is at least 18px everywhere**, including the source line under each answer, and the page still works at 200% zoom.
- **Every fact in an answer carries its own source.** Answers are built claim by claim, and a statement the plan documents do not support is not shown at all.
- **The assistant says what it could not answer.** If part of a question is outside the plan documents, it names that part and gives the phone number instead of quietly leaving it out.
- **Answers appear as they are written**, rather than after a pause.
- **When the plan documents disagree, the Evidence of Coverage wins** and the disagreement is stated rather than hidden.
- **Answers now come from the whole plan library, not one document.** Questions can be answered from the Evidence of Coverage, the Summary of Benefits, the Annual Notice of Change, the drug formulary and Clover's public pages, for both indexed plans.
- **Drug questions work.** Asking about a specific medication finds it by name, including uncommon brand names, and returns its tier and any restrictions.
- **Ask a question, get a cited answer.** `npm run ask -- "what is the specialist copay" --plan 004` returns the amount from the plan's own Summary of Benefits, with the document, contract, plan, plan year and section it came from. Asking the same question against plan 007 returns that plan's different amount, because the two plans are indexed separately.
- **Answers say when they do not know.** A question the plan documents do not cover gets a plain statement that it was not found, rather than a guessed amount.
- **Identifiers are removed before anything is stored.** Typing a member id, date of birth or social security number into a question leaves the question intact and the identifier gone.
- **The plan document corpus builds from one command.** Fetches the 2026 Clover PPO documents for Hudson County, New Jersey - Evidence of Coverage, Summary of Benefits, annual notice of change, formulary and pharmacy directory, plus public corporate pages - converts them to text, and writes a report naming anything it could not retrieve.

### Changed

- **Working agreement.** `CLAUDE.md` is now a behavior contract instead of a template: spec before code, TDD, zero PHI in v1, cite-or-refuse answers, design forks go to the human, no invented Clover/Medicare/CMS facts, ask before adding a dependency. Cut from 399 lines to 94 so it costs less context each session. Stale scaffold sections (unfilled environment, another repo's stack notes) are gone.

### Fixed

- **"Did this answer your question?" now records the answer.** The control had been showing your choice without saving it anywhere since it was added. Regression covered by `migrations/004_release.sql` and the feedback endpoint.
- **The deployed assistant can answer questions again.** Every question came back as "The assistant could not be reached" while the plan list loaded normally, because the deploy script folded its own separator into each variable name and the running service was left without a database address. Regression test: `tests/unit/deploy-config.test.ts`.
- **Spoken answers no longer read the source list aloud.** The assistant was reading the citation markers and every "Where this comes from" line, so a 191-character answer took 400 characters to say. Regression test: `tests/unit/spoken-answer.test.ts`.

---

## [0.1.0] - 2026-09-07

### Added

- Initial project scaffold via Spec-Driven Development Starter Kit.
