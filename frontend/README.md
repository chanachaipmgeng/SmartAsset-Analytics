# Frontend — myAssets

Angular 22 (standalone, zoneless, signals, OnPush) + Syncfusion 32.2.3 Material 3 + Tailwind CSS v4

แนวทางเขียนโค้ดและระบบสไตล์ดูที่ [../docs/architecture.md](../docs/architecture.md#frontend)

## คำสั่ง

```bash
npm ci
npm run license:generate        # เขียน public/app-config.json จาก SYNCFUSION_LICENSE
npx ng serve --port 4210        # proxy /api → http://127.0.0.1:8001 (proxy.conf.json)
npx ng build                    # production build → dist/frontend
npx ng test                     # Vitest
```

## โครงสร้าง

| โฟลเดอร์ | เนื้อหา |
| --- | --- |
| `src/app/core` | `ApiService` (mutation), auth store/guards/interceptor, models, labels, `device-actions`, locale ไทยของ Syncfusion, theme |
| `src/app/layout` | shell: app bar, sidebar |
| `src/app/pages` | หน้าตาม route |
| `src/app/shared` | `data-grid`, dialog ทำรายการอุปกรณ์, command palette, page header, empty/error/skeleton, stat card, timeline, map |
| `src/styles` | `_tokens.scss`, `_mixins.scss` (`@use 'tokens' as *;`) |
| `src/tailwind.css` | Tailwind theme/utilities + CSS ของ Syncfusion ใน `@layer syncfusion.components` |
| `src/styles.scss` | `ej2-base` (layer `syncfusion.base`), สีแบรนด์, คลาส global, override |
