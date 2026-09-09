# Browser performance

Measured with **Lighthouse 12.8.2** against the deployed site at
`https://clovbot.v-ai.org`, on **2026-09-09**. Four runs: the landing page and
the assistant route, each on desktop and on Lighthouse's throttled mobile
profile (a mid-range Android on simulated 4G).

These are production numbers, not a local build. Nothing here was tuned for the
scan and no code changed because of it: §4 lists what the scan found still open.

---

## 1. Scores

| Route | Profile | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| Landing | Desktop | **100** | **100** | **100** | 91 |
| Assistant | Desktop | **100** | **100** | **100** | 90 |
| Landing | Mobile, throttled | 94 | **100** | **100** | 91 |
| Assistant | Mobile, throttled | 97 | **100** | **100** | 90 |

**Accessibility is 100 on every route and profile.** That is the number this
project cares about most, for an audience that is mostly over 65. It is not a
substitute for a person using a screen reader, which
[docs/future-work.md](./future-work.md) still lists as owed, but it does mean the
automated floor holds everywhere.

The SEO deduction is a single missing tag. See §4.

---

## 2. Metrics

| Route | Profile | FCP | LCP | TBT | CLS | Speed Index | TTI | Transfer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Landing | Desktop | 0.4 s | 0.6 s | 0 ms | 0 | 0.5 s | 0.6 s | 741 KiB |
| Assistant | Desktop | 0.3 s | 0.3 s | 0 ms | 0.024 | 0.3 s | 0.3 s | 134 KiB |
| Landing | Mobile | 1.5 s | 3.0 s | 0 ms | 0 | 1.5 s | 3.0 s | 741 KiB |
| Assistant | Mobile | 1.5 s | 1.5 s | 0 ms | **0.101** | 1.5 s | 1.5 s | 134 KiB |

**Total blocking time is 0 ms everywhere**, which is the result worth pointing
at. The main thread is never busy long enough to drop an interaction, on any
route or profile. That follows from choices made for other reasons: no framework
runtime beyond React, hand-written CSS rather than a utility framework's
stylesheet, no analytics, no tag manager, and no third-party script of any kind.

**The assistant is 134 KiB and loads in 0.3 s on desktop, 1.5 s throttled.** The
PDF renderer is not in that number: `jspdf` is a separate 130 KiB chunk fetched
only when someone presses **Save as PDF**, so a member who never exports never
pays for it.

**Server response time was 10 ms** on the landing document.

---

## 3. Why it is fast

Nothing here was a performance optimisation. Each was decided for another reason
and the speed is a side effect.

- **No third-party origins at all.** No CDN, no webfont, no analytics, no tag
  manager. The Content-Security-Policy in `vercel.json` is strict precisely
  because there was nothing to allow, and the page makes no cross-origin request
  on load.
- **No webfonts.** The two faces the design names are licensed and not on a
  public CDN, so the stacks fall back to the system sans. That removes a render
  block and a flash of unstyled text that this audience would notice.
- **The API is proxied same-origin.** `/api/*` rewrites to Cloud Run, so there is
  no preflight and no second TLS handshake before the first question.
- **The reranker runs server-side**, so the ONNX model never reaches the browser.
- **The heavy work is precomputed.** Chunking, embedding and drug parsing happen
  in the corpus pipeline before deploy; the running service never touches a PDF.
- **Answers stream.** Time to first token is what a member experiences, and the
  answer renders progressively rather than after the whole generation.

---

## 4. What the scan found, still open

Nothing was changed in response to the scan, so these are live.

### Three landing images, 481 KiB recoverable

The mobile LCP of 3.0 s is one element: `hero-member.jpg`, the landing hero.

| Image | Served | Wasted |
| --- | --- | --- |
| `hero-member.jpg` | 297 KiB | 222 KiB |
| `guide-couple.jpg` | 202 KiB | 134 KiB |
| `livehealthy-kitchen.jpg` | 95 KiB | 33 KiB |

They are full-size JPEGs scaled down by CSS. Lighthouse estimates 389 KiB from
sizing them correctly and 327 KiB from a modern format, overlapping to about
481 KiB total. Preloading the hero is worth a further 40 ms.

**This is the landing page only.** The assistant route carries none of these, and
it is the assistant that a member actually uses.

### One layout shift on the assistant, CLS 0.101

Mobile only, and just past the 0.1 threshold that counts as good. The shifting
element is `<main class="page" id="main">`, so it is the full-page assistant
settling as it mounts rather than an image without dimensions. Desktop is 0.024
on the same route.

### No meta description

The only SEO deduction on either route, and a one-line fix in `web/index.html`.
It costs 9 points on the landing and 10 on the assistant.

### 79-81 KiB of unused JavaScript

React and the animation library ship more than the first paint uses. Real, and
not obviously worth a code-splitting pass at 134 KiB total.

---

## 5. Reproducing this

Lighthouse is **not a dependency of this project**. It runs from `npx`, using the
Chromium that Playwright already installs for the screenshot script:

```bash
export CHROME_PATH="$(node -e "console.log(require('playwright').chromium.executablePath())")"

npx lighthouse@12.8.2 https://clovbot.v-ai.org/ \
  --preset=desktop --chrome-flags="--headless=new" \
  --output=html --output-path=./lighthouse-desktop.html

npx lighthouse@12.8.2 https://clovbot.v-ai.org/assistant \
  --chrome-flags="--headless=new" \
  --output=html --output-path=./lighthouse-mobile.html
```

Omitting `--preset=desktop` gives the throttled mobile profile, which is the one
worth watching: it is closer to the device and connection this audience has.

---

## 6. What this does not measure

- **The answer path.** Lighthouse measures the page loading, not a question being
  answered. Retrieval, reranking and generation latency are measured separately
  by the eval harness and recorded per turn in `latency_ms`.
- **A real device on a real network.** These are simulated throttles on a
  laptop. [docs/future-work.md](./future-work.md) still lists throttled
  real-device measurement as owed.
- **Voice.** Synthesis and transcription latency are in
  `eval/results/voice-latency.json`.
- **Anything under load.** Single runs against a warm service with
  `--min-instances 1`, so no cold start is included.
