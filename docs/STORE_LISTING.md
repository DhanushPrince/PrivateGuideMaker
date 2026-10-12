# Chrome Web Store listing (draft)

- **Title:** Private Guide Maker — Private Step-by-Step Guide Recorder
- **Short description (≤132 chars):** Turn clicks into how-to guides with screenshots. Emails, cards, Aadhaar, PAN & passwords are blurred before capture. 100% local.
- **Category:** Productivity / Workflow & Planning
- **Single purpose:** Record the user's actions in a tab into a step-by-step guide with redacted screenshots.
- **Upload:** `dist/Private Guide Maker.zip` from `npm run build` (manifest.json at the zip root).

## Privacy practices tab
- Data collected: none transmitted. The extension processes website content (page text, screenshots) locally, only on the tab the user chooses to record.
- Sold to third parties: No. Used for purposes unrelated to the single purpose: No. Used for creditworthiness/lending: No.
- Remote code: No.
- Privacy policy URL: https://YOUR-DOMAIN/privacy (placeholder — must be a real page before submitting).

## Permission justifications
| Permission | Justification |
|---|---|
| `activeTab`, `scripting` | Inject the recorder into the tab the user records. |
| `storage`, `unlimitedStorage` | Settings + guides/screenshots in local IndexedDB. |
| `sidePanel` | Recording UI. |
| `webNavigation` | Turn page navigations into steps and re-inject the recorder after each load. |
| host `<all_urls>` | `activeTab` is lost when the recorded tab navigates to another page/origin, so multi-page guides and "Guide Me" replay could not re-inject the recorder or capture screenshots without re-clicking the icon on every page. Used only on the tab being recorded / replayed. |
