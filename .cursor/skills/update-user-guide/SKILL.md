---
name: update-user-guide
description: Updates the Thai user guide in docs/user-guide with fresh screenshots captured from the running app through the Cursor browser (CDP), and records UX/UI findings. Use when the user asks to update the manual, retake screenshots, document a new flow, or run a UX review along the flows.
disable-model-invocation: true
---

# Update the user guide with screenshots

Guide: `docs/user-guide/README.md`. Images: `docs/user-guide/images/NN-name.png` (numbered in flow order).
Playwright recapture of the whole set: `node scripts/guide-screenshots.cjs` (see header). After README edits: `node scripts/guide-html.cjs`.

New flows to keep in the shot list: bell backlog (`51-alerts`), customer tenant on edit (`52-customer-edit`), customer import (`53-customer-import`), repair orders (`54-repairs`), analytics report tabs (`55-reports-risk`), admin password reset (`56-user-reset-password`), device risk + documents (`57-device-risk`).

## 1. Run the app

Prefer the Docker stack at `http://localhost:8088` (`docker compose up -d` then `docker compose exec api python -m app.infrastructure.demo_data`). Playwright uses `GUIDE_BASE_URL` (default 8088).

Local split (only if you are iterating on frontend/API outside containers):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
cd backend && uv run uvicorn app.main:app --port 8001
cd frontend && npx ng serve --port 4210
```

If port 5434 is not published (stack started without the dev file), either rerun the db line or point a proxy
config at the Docker nginx (`"/api": { "target": "http://127.0.0.1:8088" }`) and `ng serve --proxy-config <file>`.

Log in with a dedicated screenshot account (superadmin shows every menu). Deactivate it afterwards
(`UPDATE users SET is_active = false ...`, run on its own so a failing statement cannot roll it back).

## 2. Capture

With the `cursor-ide-browser` tools (never in parallel):

1. `Emulation.setDeviceMetricsOverride` → `{width: 1280, height: 800, deviceScaleFactor: 1, mobile: false}`
   (mobile shots: `390×844`, scale 2, mobile true). Set light theme: `localStorage['inventory.theme']='light'` then reload.
2. Drive the UI with `Runtime.evaluate`:
   - Syncfusion dropdown/date/numeric: `el.ej2_instances[0].value = v; el.ej2_instances[0].dataBind()`
   - text inputs: set `.value` then dispatch `input` (bubbles)
   - menu toggle / flaky clicks: `dispatchEvent(new MouseEvent('click', {bubbles: true}))`; Escape via `browser_press_key`
   - fill forms but press ยกเลิก instead of saving unless the flow needs the result
3. Check with `browser_take_screenshot`, then `Page.captureScreenshot {format:'png'}`; the response is saved as
   `~/.cursor/browser-logs/cdp-response-Page.captureScreenshot-<ISO time>.json`.
4. Decode: `powershell -File .cursor/skills/update-user-guide/scripts/decode-shots.ps1 HH-MM-SS=NN-name ...`
   (`HH-MM-SS` is the time part of that file name).
5. `Emulation.clearDeviceMetricsOverride` when done.

## 3. Write

- Thai, one section per flow, step text then `![alt](images/NN-name.png)`; describe only what is on screen.
- Verify claims against code (e.g. is a card clickable?) before writing them.
- Keep the "ผลตรวจ UX/UI" section: fixed items (table) and open suggestions (numbered). Fix small issues in code
  as you go (locale strings, widths, wording), re-capture affected shots, and list them as fixed.

## 4. Finish

`npx ng build`, commit docs + fixes, deactivate the account, stop the servers you started.
