# Real-device latency

NFR-PERF-05 requires a manual pass on a real mid-range Android before any
demonstration, because CI and a laptop both flatter the numbers.

Every figure recorded so far in this project is **unthrottled and on a laptop**.
Fill this in from a phone. Where a number differs from the CI figure, record
both: the difference is the finding.

## How to take the measurements

1. Deploy, then open `https://clovbot.v-ai.org` on the phone.
2. Connect the phone to a desktop Chrome via `chrome://inspect` so the Network
   and Performance panels are available.
3. In DevTools, set **Network: Slow 4G** and **CPU: 4x slowdown**, per NFR-PERF-05.
4. Ask each question below three times. Record the **median**, not the best run.
5. Read the numbers from the Network panel timings, and from the `latency_ms`
   column the API records on each turn.

## Results

Device: ______________________  Android version: __________  Browser: __________
Network: Slow 4G throttled / real cellular / wifi (circle one)
Date: __________

| Measurement | Requirement | Target | Laptop, unthrottled | Phone, throttled |
| --- | --- | --- | --- | --- |
| Retrieval p95 | NFR-PERF-01 | 300ms | ~300ms | |
| Time to first token | NFR-PERF-02 (D-041) | 2000ms | 1632ms | |
| Time to first audio | NFR-PERF-03 (D-046) | 4500ms | 4007ms | |
| Spoken answer rate | NFR-PERF-04 (D-046) | ~18 chars/sec | 18 chars/sec | |

## Questions to use

1. `what is my specialist copay` - short answer, two claims
2. `what do I pay for an emergency room visit` - longer answer
3. `do I need a referral to see a specialist` - process answer, no amount

## Also check by hand, since no tooling covers it

These are the accessibility criteria D-040 left unverified. A phone is the right
place to check the first three.

- [ ] Every control is reachable by keyboard, with a visible focus ring.
- [ ] The layout reflows at 200% zoom with no horizontal scrolling.
- [ ] Every tap target is comfortably hittable one-handed.
- [ ] One full question and answer read with a screen reader, reading order sensible.
- [ ] The microphone works, and the listening rings respond to the voice.
- [ ] The unaffiliated case-study notice is visible on first load.

## Notes

_Anything that behaved differently from the laptop._
