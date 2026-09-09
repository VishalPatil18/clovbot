# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Ask in Spanish and get a Spanish answer**, from Clover's own Spanish plan documents rather than a translation, cited to the Spanish document you can go and read. The assistant notices you have written Spanish and follows, and a language button beside the microphone switches it back at any time. Answers are read aloud in a Spanish voice, and the buttons, help and refusals are Spanish too.
- The drug list is published only in English, so a Spanish answer about a medication says so and points at the English list rather than refusing.
- **The assistant works on a phone.** It opens as the full screen rather than a floating panel, the menu stacks into one row per item with nothing hidden behind a button, and the microphone in voice mode is centred and full size. Nothing is cut off at the edge of the screen any more, and the conversation itself now takes about half the screen instead of a third.

### Changed

- **Re-indexing the plan documents clears the saved answers for them**, so a change to a document is never answered from before the change.
- **Repeated questions come back immediately.** An answer already given for the same question, on the same plan and in the same language, is served without asking the model again, and a spoken answer is only ever recorded once. Asking a *different* question never reuses another one's answer, however similar it sounds.
- **A spoken answer can be paused and picked up where it left off.** The Stop button is gone: it threw away your place, and playing again from the start was already a button of its own. Controls that are unavailable now look unavailable instead of doing nothing when pressed.
- The assistant panel on a desktop was quietly cutting off the right-hand edge of its own contents at narrower window sizes. It now fits whatever width it is given.
- On the full page, the tools down the left are now one consistent column in a deliberate order, and they highlight when you point at them rather than staying lit after a click. Back reads as a way out rather than a seventh button.
- Tidier throughout after a pass on a real phone: the controls sit on the same line as the title and against the right edge, the help panel closes with its own X, the suggested questions always form an even grid, and on a phone the voice, language and help controls move up beside the Back button so the conversation gets the room instead.

### Fixed

- _<bug fixes>_

### Removed

- _<removed capabilities>_

### Security

- Which member's record the assistant can read is now enforced by the database, not only by the query that asks for it. One member's session reads zero rows belonging to another, proven by a check that queries the database directly with the application bypassed. Every record is still invented demonstration data.
- The assistant reads only the part of your record your question needs. Asking what a specialist visit costs no longer touches your claims, your prior authorisations or your appointments, and nothing it does reads your name.
- Every read of your record is recorded: which fields, from which rows, when, and what came of it. The record holds the names of the fields and never their contents, and nothing in the assistant can alter or remove an entry once written.
- If your sign-in runs out, the assistant says so and which limit was reached, instead of quietly showing you a sign-in form again.

---

## [1.1.0] - 2026-09-09

The authenticated tier: a member can sign in with an emailed code and ask about their own record, and every answer still cites the line it came from. A second Medicare contract, typed drug lookups, and a conversation that survives a refresh.

### Added

- A second Medicare contract is indexed: **Clover Health Classic (HMO), H8010-002**, alongside the two Choice PPO plans. The same question now returns each plan's own answer - the out-of-pocket maximum is $6,000 under the HMO and $9,250 under the PPO - each cited to that plan's own documents.
- The chosen plan stays visible in the assistant header with a **Change plan** control. Switching re-scopes what you ask next and leaves earlier answers exactly as they were answered.
- You can sign in without a password. Enter your email, get a six-digit code, and type or paste it in - all inside the assistant, so the conversation you were having is still there afterwards. The code works once and lasts ten minutes.
- While signed in, the assistant says who you are signed in as, and one tap signs you out. Signing out removes anything about your own record from the conversation saved on that device, and leaves the general answers.
- Ask something only your own record can answer while signed out, and the assistant now says so plainly and offers to sign you in, rather than refusing or guessing. Sign in and it answers the question you already asked, without you retyping it. Questions the plan documents can answer are never put behind a sign-in.
- The assistant can answer questions about a member's own record at a terminal: what a claim cost, where a prior authorisation stands, how much of an allowance is left, and who the assigned provider is. Answers cite the record and the exact field, and a question that spans both gets the record and the plan documents in one reply, each with its own source. Every record is invented demonstration data.
- Your conversation is kept on your own device and comes back when you return. A **Clear saved conversations** control deletes it, and **Start over** empties the current conversation without touching what is saved.
- **Print** produces a clean copy of the conversation with every source intact and none of the buttons, which your browser can save as a PDF or send to a printer.
- **Copy this answer** puts one answer, its sources, your plan and the document date on the clipboard as plain text, ready to paste into an email or a message.
- A **Help** panel lists what you can ask, what the assistant cannot do, and what each button does. It opens in place rather than covering the conversation.
- Once the calendar passes the plan year the documents cover, every answer says so in plain words and tells you to call and check. The notice is read aloud with the answer too, since audio cannot be scrolled back to.
- The date the plan documents were collected is now recorded and served alongside the plan list.
- Longer answers are now grouped under the part of the plan document each set of sentences came from, so you can find one section again instead of re-reading the whole reply.
- Every quality check now runs in one pass and reports together: answer faithfulness, which retrieval path each question took, whether sign-in was asked for correctly in both directions, and whether any earlier measure has slipped. A drop in any of them fails the build.

### Changed

- Plans are named wherever they are shown. The callback request used to label a member's plan "H5141-004"; it now reads "Clover Health Choice (PPO)".
- Drug list and Clover information answers work under every plan rather than only the plans on one contract.
- Drug tier answers now come from the drug list itself rather than from a search over its text, and cite the drug they read. Asking what tier a drug is on returns its tier, its therapeutic class and any prior-authorization, quantity or step-therapy limit.
- Asking about a drug and a rule in one sentence answers both. "Is Eliquis covered and how do I appeal a denial" returns the tier from the drug list and the appeal process from the Evidence of Coverage, each with its own source.
- The assistant panel now keeps its header and its message box in view while the conversation scrolls between them, so **Talk to a person** is always reachable. Close is an **X** at the top right.
- Opening the assistant dims the page behind it so the conversation is the only thing competing for attention. Click outside it, press Escape, or use the X to close. Anything you had started typing is still there when you come back.
- While an answer is being prepared, the assistant says what it is doing at each step rather than showing one unchanging line.
- The question box now grows to four lines as you type and holds a much longer question.
- You can play an answer aloud and scroll back through the written version at the same time.
- Tidier panel throughout: a single row of controls at the top, matching heights on the question box, microphone and Ask button, and slimmer scrollbars that stay out of the way until you need them.

### Fixed

- Asking something only your own record can answer showed the sign-in card and then replaced it with "Something went wrong reaching the plan documents." The answer was right; recording the question failed, and the failure was shown instead of the answer.
- The sign-in card now opens under the question that needs it rather than at the top of the conversation, where a second question pushed it off screen. It closes with an **X** at its top right, and asking something else closes it too.
- A code that does not match now reads as an error, in red, rather than in the same colour as everything else on the card.
- Statin citations named the wrong drug class. Ten drugs under "ANTILIPEMICS, HMG-CoA REDUCTASE INHIBITORS" were indexed and cited under the class listed above them, so an answer about atorvastatin pointed a member at the wrong part of the drug list. The tier was right; the source line was not.

### Security

- Sign-in codes are never stored. Only a scrypt hash and a per-code salt are kept, and the comparison is timing-safe.
- A code works once, expires after ten minutes, and stops accepting attempts after five wrong tries.
- Asking for a code at an address that is not enrolled returns the same message as one that is, and sends nothing. The page cannot be used to find out who is a member.
- A sign-in mints a fresh session id in its own `HttpOnly; SameSite=Lax` cookie. It expires after 30 minutes idle or 8 hours in total, whichever comes first.
- Which member's record is read comes from the session row and from nothing the member or the model can say. No classifier can cause someone else's record to be retrieved.
- Code requests are capped at ten an hour per address and thirty an hour per network.
- Every member record in this system is invented. No real member data enters it at any version.

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
