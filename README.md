# StepSafe

**Record your clicks into a step-by-step how-to guide — with sensitive data blurred on the page *before* every screenshot.** Local-only, no account, free unlimited exports (Markdown, HTML, PDF).

StepSafe is a Chrome (MV3) extension, a fork of [Pagewalk](https://github.com/hamad501/pagewalk) (MIT). Vanilla JS, no build step, no runtime dependencies beyond the libraries Pagewalk already vendored.

## What it does
- Each click (and typed field) becomes a step: screenshot + auto step text (`Click "Save"`, `Type in "Email"`).
- **Redaction is ON by default.** While recording, the page is masked (blur by default) and kept masked: a `MutationObserver` re-masks content added later, and redaction is re-run synchronously right before every capture (hover pre-shot, mousedown, click, keystroke, post-load, navigation, manual, start).
- Detected: emails, phones (incl. Indian `+91` / 10-digit mobiles), card numbers (Luhn-checked), Aadhaar (Verhoeff-checked), PAN, UPI IDs, IFSC, US SSN, money (opt-in), custom regexes. Always blurred: password fields, `[data-stepsafe-blur]` elements, and anything you **Alt+click** while recording (toggles; not recorded as a step). Per-category toggles in Settings.
- Detected PII is also masked out of step text, page titles and typed values (typed values never appear in step titles).
- **On-device AI step titles** via Chrome's built-in Prompt API (`LanguageModel`, Gemini Nano). Used only if the model is already available on the device; otherwise the deterministic template text is kept. Nothing is sent off-device.
- Exports: Markdown (images embedded as data URIs), standalone HTML, PDF (HTML + print stylesheet → browser's *Save as PDF*). Small "Made with StepSafe" link in exports and viewer.

## Install (load unpacked)
1. Unzip `StepSafe.zip` (or clone this folder).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the folder containing `manifest.json`.
4. Click the StepSafe toolbar icon → side panel → **Start Capture**.

Tests (no dependencies): `node --test test/`

## Permissions
| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Inject the recorder into the tab you record. |
| `storage`, `unlimitedStorage` | Settings + guides/screenshots in local IndexedDB. |
| `sidePanel` | Recording UI. |
| `webNavigation` | Turn page navigations into steps and re-inject the recorder after each load. |
| host `<all_urls>` | `activeTab` alone is lost when the recorded tab navigates to another page/origin, so a multi-page guide (and "Guide Me" replay) could not re-inject the recorder or capture screenshots without the user re-clicking the icon on every page. It is used only on the tab you are recording / replaying. |

Removed vs Pagewalk: `tabs` (not needed with host access) and `web_accessible_resources` (extension pages no longer exposed to websites). No `chrome.debugger`, no remote code, no network requests.

## Privacy
StepSafe has no server, no account, no analytics and makes no network requests. Guides, screenshots and settings stay in your browser profile (IndexedDB / `chrome.storage.local`). AI titles run on-device through Chrome's built-in model; StepSafe never sends page content anywhere. Exports are files you save yourself.

**Limits of redaction** (best effort — review screenshots before sharing): text inside canvas/images/video, cross-origin iframes and closed shadow roots is not detected; values set by page script without any DOM mutation or `input` event are caught at the next capture's re-scan, not between scans; regexes can miss unusual formats or over-blur look-alikes (e.g. any 9-digit number when the SSN category is on). Alt+click marks last for the current page only.

## Chrome Web Store listing (draft)
- **Title:** StepSafe — Private Step-by-Step Guide Recorder
- **Short description (≤132):** Turn clicks into how-to guides with screenshots. Emails, cards, Aadhaar, PAN & passwords are blurred before capture. 100% local.
- **Category:** Productivity / Workflow & Planning
- **Single purpose:** Record the user's actions in a tab into a step-by-step guide with redacted screenshots.
- **Privacy practices:**
  - Data collected: none transmitted. The extension processes website content (page text, screenshots) locally, only on the tab the user chooses to record.
  - Sold to third parties: No. Used for purposes unrelated to the single purpose: No. Used for creditworthiness/lending: No.
  - Remote code: No.
  - Permission justifications: as in the table above.
  - Privacy policy URL: https://stepsafe.app/privacy (placeholder).

## Attribution
Fork of [hamad501/pagewalk](https://github.com/hamad501/pagewalk) — MIT License, see `LICENSE` (unchanged) and `NOTICE`. The first commit in this repo is the unmodified upstream import, so `git diff HEAD~N` (or `git log -p`) shows every StepSafe change.

## Architecture (unchanged layout)
```
background/service-worker.js   message router, capture pipeline
content/recorder.js            click/keystroke capture + redaction engine
lib/pii.js                     PII regexes + Luhn/Verhoeff (shared with tests)
lib/ai-titles.js               Prompt API titles with template fallback
lib/export.js                  Markdown / HTML / PDF(print)
sidepanel/ viewer/ dashboard/  UI
```
