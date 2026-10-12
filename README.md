# Private Guide Maker

Private Guide Maker is a Chrome extension (Manifest V3) that turns your clicks into a step-by-step how-to guide with a screenshot for every step. Sensitive data is blurred on the page **before** each screenshot is taken: emails, phone numbers, card numbers, Aadhaar, PAN, UPI IDs, IFSC codes and passwords. Everything stays on your machine. There is no account, no server and no network requests. You edit the guide in the browser and export it as Markdown, HTML or PDF. Private Guide Maker is a fork of [Pagewalk](https://github.com/hamad501/pagewalk) (MIT). It is plain JavaScript with no build step, and the extension has no runtime dependencies.

## Contents
- [Features](#features)
- [Quick start on a Mac](#quick-start-on-a-mac)
- [5-minute manual test checklist](#5-minute-manual-test-checklist)
- [Automated tests](#automated-tests)
- [AI step titles on a Mac](#ai-step-titles-on-a-mac)
- [Permissions](#permissions) · [Privacy](#privacy) · [Known limitations](#known-limitations)
- [Project structure](#project-structure) · [Build / zip](#build--zip) · [Attribution](#attribution)

## Features
- **Recording from the side panel:** Start, Pause/Resume, manual Screenshot, Discard and Complete. Each click, typed field and page navigation becomes a step. Every step gets a screenshot and an automatic title (`Click "Save profile" button`, `Type in "Nickname"`). Typed values never show up in step titles.
- **Redaction is on by default.** While you record, the page is masked (blur, or black blocks if you choose) and stays masked. Content added to the page later is re-masked, and redaction runs again right before every capture.
  - Detectors: emails; phones, including Indian `+91` and bare 10-digit mobiles; card numbers (Luhn-checked); Aadhaar (Verhoeff-checked); PAN; UPI IDs; IFSC; US SSN. Money amounts and all form fields are opt-in. You can also add custom regexes.
  - Always blurred: password fields, elements marked `[data-stepsafe-blur]`, and anything you **Alt+click** (⌥+click) while recording. Alt+click toggles the mark and is not recorded as a step.
  - Detected PII is also removed from step text and page titles.
- **Editor (viewer → Edit):** edit step titles, add notes, reorder or delete steps, remove the starting screenshot, add callouts and headings, and annotate screenshots (blur box, arrow and more).
- **History:** a version snapshot is saved whenever you enter Edit mode. You can restore any snapshot.
- **Exports:** Markdown (images embedded), standalone HTML (works offline) and PDF (print view → *Save as PDF*). There is also Copy as text. Exports carry a small "Made with Private Guide Maker" link. Branding (name, colour, logo) applies to HTML and PDF.
- **Guide Me:** replays a guide on the live page with an on-page overlay (Next/Close).
- **Dashboard:** search, rename, pin, tag, duplicate and delete guides. Settings → Backup can export or import all guides and settings as JSON.
- **On-device AI step titles** use Chrome's built-in Prompt API (Gemini Nano). They are optional, and Private Guide Maker falls back to template titles (see [below](#ai-step-titles-on-a-mac)).

## Quick start on a Mac
1. Get the code: `git clone <repo> Private Guide Maker`, or unzip `Private Guide Maker-repo.zip`. You can also unzip the ready-to-load `Private Guide Maker.zip`, which has `manifest.json` at its top level.
2. In Chrome (version 138 or newer), open **`chrome://extensions`**.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked**. Select the **`extension/`** folder of this repo, which is the folder that contains `manifest.json`. If you unzipped `Private Guide Maker.zip`, select the unzipped folder itself.
5. Pin the icon: click the puzzle-piece icon in the toolbar, then the pin next to **Private Guide Maker**.
6. Click the Private Guide Maker icon. The **side panel** opens on the right. Click **Start Capture**.

After you change files in `extension/`, click the ↻ reload button on the Private Guide Maker card in `chrome://extensions`, then reload the page you are testing.

## 5-minute manual test checklist
The repo includes test pages with **fake** PII in `e2e/site/`:
- `index.html`: a fake bank profile with links to `page2.html`
- `pii.html`: one row per PII category

Serve them over HTTP from the repo root. Either command works:
```bash
npx serve e2e/site -l 8080            # then open http://localhost:8080/index.html
python3 -m http.server 8080 -d e2e/site   # then open http://localhost:8080/index.html
```
(Opening the pages as `file://` only works if you turn on **Allow access to file URLs** on the Private Guide Maker card in `chrome://extensions` → Details.)

| # | Do this | Expected result |
|---|---|---|
| 1 | Open `http://localhost:8080/index.html`, click the Private Guide Maker icon, click **Start Capture** | Side panel switches to recording, the toolbar badge shows recording, and a "Starting on Acme Bank — Profile" screenshot is taken |
| 2 | Look at the page while recording | The email, phone `+91 98765 43210`, Aadhaar `2341 2341 2346`, PAN `ABCPE1234F`, card `4111 1111 1111 1111`, UPI `priya@okhdfcbank`, IFSC `HDFC0001234`, password field, login-email field and the "Internal note (marked)" line are **blurred**. Name labels and buttons stay readable |
| 3 | Click **Show linked account** | A new step appears in the side panel. The newly shown UPI `sharma.p@oksbi` and card `5555…4444` are blurred too (dynamic content) |
| 4 | **⌥ Option+click** the Nickname field, then click it and type ` 9876543210`, then press Tab | Alt+click blurs the field and is *not* a step. The typing step is titled `Type in "Nickname"`, and the typed number appears nowhere in the step text |
| 5 | Click **Save profile**, then **Go to statements**. On page 2, type in the search box and click **Download statement** | You get click steps, a "Navigate to…" step with a screenshot, and more steps on page 2 |
| 6 | Side panel: **Pause**, click something, then **Resume**, then **Screenshot**, then **Complete** | Clicks made while paused are not recorded. A "Screenshot" step is added. The panel returns to idle and lists the guide under recent guides |
| 7 | Open the guide (click it in the side panel or the dashboard). Check the screenshots | Every screenshot shows the PII blurred. Nothing sensitive is readable |
| 8 | Dashboard (⚙ in the side panel) → **Settings**: uncheck *Emails*, click **Save**, then record a quick capture on `pii.html` | The email is no longer blurred, and the other categories still are. Try *Redact style → Black blocks* and *Auto-redact* off. Turn the defaults back on afterwards |
| 9 | In the viewer, switch to **Edit**. Rename a step, add a note, move a step up or down, delete a step, use *Add step → Callout*, and click a screenshot to annotate (blur box + arrow → Save). Then reload | All edits are still there after the reload |
| 10 | Click **History** (clock icon) → **Restore** the oldest version | The guide returns to its state before editing |
| 11 | **Share → Export as Markdown / HTML / PDF** (PDF opens the print view → *Save as PDF*) | The files download. Steps are numbered 1…N the same way in all three, the starting screenshot is an unnumbered cover, images are embedded, and no raw PII appears |
| 12 | Click **Guide Me** | A new tab opens the first page with an overlay. **Next** moves to the next step and **Close** ends the replay |
| 13 | Dashboard: search, rename, pin, tag and delete guides | Each change takes effect immediately and survives a Chrome restart |
| 14 | Settings → Backup → **Export**, then **Import** the same file | `private-guide-maker-backup-YYYY-MM-DD.json` downloads. Import adds the guides as new copies |

## Automated tests
**Prerequisites:** Node.js 20 or newer (`node -v`) and about 300 MB for Playwright's Chromium. Playwright is a dev dependency only. The extension itself has zero dependencies.

```bash
npm install
npx playwright install chromium   # Playwright's bundled Chromium (branded Chrome no longer loads extensions from the command line)
npm test                          # unit tests: PII detectors (node --test, no browser), under 1 s
npm run test:e2e                  # end-to-end: loads extension/ unpacked into Chromium, about 5 min
HEADLESS=0 npm run test:e2e       # same, but you can watch the browser (SLOWMO=200 slows every action)
node e2e/run-all.js feat-b        # run one script (feat-c/d/e reuse the guide recorded by feat-a)
```

`npm run test:e2e` exits non-zero if any check fails. Outputs go to **`e2e/output/`**, which is gitignored and wiped at the start of each full run:
- `SUMMARY.md` and `results.json`: PASS/FAIL per check, with notes
- `*.png` / `*.jpg`: screenshots of every step, including the captured, redacted step images
- `exports/`: the downloaded Markdown, HTML, PDF, clipboard text and JSON backup
- `profile/`: the Chromium profile shared by the scripts

| File | Covers |
|---|---|
| `e2e/harness.js` | Shared helpers: launch Chromium with the extension, test-site server, CDP access to the real side panel, results |
| `e2e/feat-a-record.js` | Install/manifest; real side panel (Start/Pause/Resume/Screenshot/Complete); recording clicks, typing, two-page navigation, hover pre-capture; template step titles; no PII in step text |
| `e2e/feat-a2-altmark-race.js` | Regression test: an Alt+click-marked field stays blurred in an immediately following fast click |
| `e2e/feat-b-redact.js` | Every PII category (with Luhn/Verhoeff negatives), dynamic content, Alt+click toggle, each Settings category toggle, opt-in money/form fields, custom regex, Blur vs Black blocks, Auto-redact off |
| `e2e/feat-c-editor.js` | AI-title feature detection and fallback; editor (titles, notes, reorder, delete, cover removal, callout/heading, persistence); annotator; History restore; duplicate |
| `e2e/feat-d-exports.js` | Markdown, HTML (offline, no external requests), PDF (print view → `page.pdf`), Copy as text, JSON backup, branding. The PDF is inspected with poppler (`brew install poppler`) if it is installed; otherwise a built-in fallback is used |
| `e2e/feat-e-dashboard.js` | Dashboard search/rename/pin/tag; persistence across a browser restart; JSON import; Guide Me replay; delete |
| `e2e/run-all.js` | Runs everything in order, picks free ports (test site starts at 8765, DevTools at 9333; override with `E2E_PORT` / `E2E_CDP_PORT`), writes the summary |

Other knobs: `EXT_DIR=/path/to/unzipped/Private Guide Maker npm run test:e2e` tests a built zip instead of `extension/`, and `E2E_OUT=…` changes the output folder. The real side panel is driven through Chrome DevTools Protocol mouse events. The OS *Save as PDF* dialog and actual Gemini Nano generation are not automated.

## AI step titles on a Mac
When you open a guide in the viewer, Private Guide Maker can rewrite the template titles into nicer ones using Chrome's **built-in Prompt API** (`LanguageModel`, Gemini Nano). The model runs **on-device**, and the inputs are the already-masked step text. Requirements, per [Chrome's docs](https://developer.chrome.com/docs/ai/prompt-api):
- Chrome 138+ (Prompt API for extensions) on macOS 13+
- At least 22 GB free on the disk that holds your Chrome profile
- A GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4+ CPU cores. Apple-silicon Macs (M1–M4) with 16 GB or more qualify
- An unmetered network connection for the one-time model download

How to check: open **`chrome://on-device-internals`** and look at *Model Status* (and the *Broker State* tab for errors). You can also open DevTools on the Private Guide Maker viewer tab and run `await LanguageModel.availability()`. It should return `"available"`.

Private Guide Maker only uses the model when it is **already available**. It never starts the multi-GB download itself. If the result is `"downloadable"`, you can start the download yourself from that DevTools console: `await LanguageModel.create()`. Then wait until `chrome://on-device-internals` shows the model as ready.

**Fallback:** if the API is missing, unavailable, or throws an error, the deterministic template titles (`Click "Save"`, `Type in "Email"`) stay as they are. There are no errors and no network calls. AI-written titles are stored with the original template text kept alongside.

## Permissions
| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Inject the recorder into the tab you record |
| `storage`, `unlimitedStorage` | Settings, plus guides and screenshots in local IndexedDB (screenshots are large) |
| `sidePanel` | The recording UI |
| `webNavigation` | Turn navigations into steps and re-inject the recorder after each page load |
| host `<all_urls>` | `activeTab` is lost when the recorded tab navigates to another page or origin. Without host access, a multi-page guide (and Guide Me replay) would need you to click the icon again on every page. Host access is used only on the tab you are recording or replaying |

Removed compared with Pagewalk: `tabs` and `web_accessible_resources`. Private Guide Maker uses no `chrome.debugger`, no remote code and no network requests.

## Privacy
Private Guide Maker has no server, no account and no analytics, and it makes no network requests. Guides, screenshots and settings stay in your Chrome profile (IndexedDB / `chrome.storage.local`). AI titles run on-device through Chrome's built-in model. Exports and backups are files you save yourself. Redaction is best effort, so **review screenshots before sharing them**.

## Known limitations
- No video or GIF capture, and no share links or cloud upload. Exports are files only.
- Text inside **images, canvas, video, cross-origin iframes** and closed shadow roots is not detected or blurred.
- The regex detectors can **over-blur look-alikes**: any Luhn-valid 16-digit number, any 10-digit number starting 6–9, or any 9-digit number when SSN is on. They can also miss unusual formats.
- **Very fast typing** across fields can be merged into one typing step, and a value set by page script without any DOM or input event is only re-checked at the next capture.
- Alt+click marks last only for the current page load.
- *Copy as text* still numbers the starting page as step 1. Markdown, HTML and PDF number the same way.
- The PDF uses the browser's print dialog (*Save as PDF*). No PDF library is bundled.
- Internal storage keys still use `pagewalk_*` names, so guides from Pagewalk backups can be imported.

## Project structure
```
Private Guide Maker/
├── extension/                 ← "Load unpacked" this folder (manifest.json inside)
│   ├── manifest.json
│   ├── background/service-worker.js   message router, capture pipeline, Guide Me
│   ├── content/recorder.js            click/keystroke capture + redaction engine
│   ├── content/player.js              Guide Me overlay
│   ├── lib/pii.js                     PII regexes + Luhn/Verhoeff (shared with unit tests)
│   ├── lib/ai-titles.js               Prompt API titles with template fallback
│   ├── lib/export.js                  Markdown / HTML / PDF (print)
│   ├── lib/storage.js                 IndexedDB guides, steps, versions
│   ├── lib/vendor/                    idb, Fabric.js, SortableJS (MIT, from Pagewalk)
│   ├── sidepanel/ viewer/ dashboard/  UI pages
│   └── assets/                        icons, CSS
├── test/pii.test.js           unit tests (node --test)
├── e2e/                       Playwright end-to-end tests + run-all.js
│   ├── site/                  fake-PII test pages (index.html, page2.html, pii.html)
│   └── output/                test artefacts (gitignored)
├── scripts/build.js           zips extension/ → dist/Private Guide Maker.zip
├── docs/STORE_LISTING.md      Chrome Web Store listing draft
├── package.json               dev scripts only (Playwright devDependency)
├── LICENSE  NOTICE  README.md
```

## Build / zip
```bash
npm run build      # → dist/Private Guide Maker.zip
```
This zips the contents of `extension/` plus `LICENSE` and `NOTICE`, with `manifest.json` at the zip root. Tests, e2e, docs and dev files are left out. The build is pure Node and needs no `zip` binary. Unzip the result and use Load unpacked, or upload it to the Chrome Web Store (listing draft: [docs/STORE_LISTING.md](docs/STORE_LISTING.md)). To bump the version, edit `extension/manifest.json`.

## Attribution
Private Guide Maker is a fork of **[hamad501/pagewalk](https://github.com/hamad501/pagewalk)** by its contributors, MIT License. The original `LICENSE` is kept unchanged, and attribution is in `NOTICE`. The first commit in this repo is the unmodified upstream import (`git log --reverse`), so `git diff <first-commit> HEAD` shows every Private Guide Maker change. Bundled libraries (idb, Fabric.js, SortableJS) are MIT licensed.
