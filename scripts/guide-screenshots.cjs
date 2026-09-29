#!/usr/bin/env node
/**
 * Captures every screenshot in docs/user-guide/images from a running stack loaded with demo data.
 *
 * Usage (PowerShell, from the repo root):
 *   npm i --prefix $env:TEMP\guide-pw --no-save playwright
 *   $env:NODE_PATH = "$env:TEMP\guide-pw\node_modules"
 *   node scripts/guide-screenshots.cjs [name-filter]
 *
 * Signs in with GUIDE_EMAIL / GUIDE_PASSWORD when set; otherwise opens a browser window and waits
 * for you to sign in as the platform admin. GUIDE_BASE_URL defaults to http://localhost:8088.
 * The import shots commit two devices (serials GUIDE-<timestamp>-n); every other dialog is cancelled.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.GUIDE_BASE_URL || 'http://localhost:8088';
const OUT = path.resolve(__dirname, '..', 'docs', 'user-guide', 'images');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

async function settle(page, ms = 900) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(ms);
}

async function shot(page, name, opts = {}) {
  await sleep(opts.wait ?? 500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
  console.log(`  ✓ ${name}`);
}

async function step(name, fn) {
  if (only && !only.test(name)) return;
  try {
    await fn();
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}: ${err.message.split('\n')[0]}`);
  }
}

async function go(page, url, ms) {
  await page.goto(BASE + url);
  await settle(page, ms);
}

async function api(page, url) {
  return page.evaluate(async (u) => {
    const s = JSON.parse(localStorage.getItem('inventory.session') || 'null');
    const res = await fetch('/api/v1' + u, { headers: { Authorization: `Bearer ${s?.accessToken}` } });
    if (!res.ok) throw new Error(`${u}: ${res.status}`);
    return res.json();
  }, url);
}

const dialog = (page) => page.locator('.e-dialog.e-popup-open').last();

function field(scope, label) {
  return scope.locator('.form-grid > div').filter({ has: scope.page().locator('label', { hasText: label }) });
}

async function pick(page, scope, label, text) {
  await field(scope, label).locator('.e-ddl').first().click();
  const list = page.locator('.e-ddl.e-popup-open li.e-list-item');
  await list.first().waitFor();
  await (text ? list.filter({ hasText: text }).first() : list.first()).click();
  await sleep(200);
}

async function type(scope, label, value) {
  await field(scope, label).locator('input, textarea').first().fill(value);
}

async function closeDialog(page) {
  const d = dialog(page);
  if (await d.count()) {
    await d.locator('.e-footer-content button', { hasText: 'ยกเลิก' }).first().click().catch(() => {});
    await sleep(400);
  }
}

async function openDevice(page, id) {
  await go(page, `/devices/${id}`, 1200);
  await page.locator('.device-detail .serial').waitFor();
  await sleep(600);
}

async function deviceAction(page, id, text) {
  await openDevice(page, id);
  await page.locator('.device-detail .actions button', { hasText: text }).first().click();
  await dialog(page).waitFor();
  await sleep(500);
  return dialog(page);
}

async function login(page) {
  if (process.env.GUIDE_EMAIL && process.env.GUIDE_PASSWORD) {
    await page.locator('input[type=email]').fill(process.env.GUIDE_EMAIL);
    await page.locator('input[autocomplete=current-password]').fill(process.env.GUIDE_PASSWORD);
    await page.locator('form button[type=submit]').click();
  } else {
    await page.locator('input[type=email]').fill('');
    await page.locator('input[autocomplete=current-password]').fill('');
    console.log('\n>>> Sign in as the platform admin in the browser window…\n');
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 0 });
  await settle(page);
}

async function main() {
  const headless = !!(process.env.GUIDE_EMAIL && process.env.GUIDE_PASSWORD);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: DESKTOP,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('guide.init')) {
      sessionStorage.setItem('guide.init', '1');
      localStorage.setItem('inventory.theme', 'light');
      localStorage.setItem('inventory.sidebar-expanded', 'false');
    }
  });
  const page = await context.newPage();

  console.log('Login');
  await go(page, '/login', 1200);
  await step('01-login', () => shot(page, '01-login'));
  await step('01b-login-error', async () => {
    await page.locator('input[type=email]').fill('someone@example.com');
    await page.locator('input[autocomplete=current-password]').fill('wrong-password');
    await page.locator('form button[type=submit]').click();
    await page.locator('ejs-message').waitFor();
    await shot(page, '01b-login-error', { wait: 800 });
  });
  await login(page);

  // Pick demo devices by status through the app's own session.
  const list = async (status) => api(page, `/devices?status=${status}&take=200`);
  const [inStock, checkedOut, installed, onLoan, underQc, inRepair] = await Promise.all(
    ['IN_STOCK', 'CHECKED_OUT', 'INSTALLED', 'ON_LOAN', 'UNDER_QC', 'IN_REPAIR'].map(list),
  );
  const central = inStock.filter((d) => !d.tenant_id);
  const tenantStock = inStock.filter((d) => d.tenant_id);
  // Showcase the installed device with the richest history and site photos.
  const activeInstalls = await api(page, '/installations?active_only=true');
  const scored = await Promise.all(
    installed.slice(0, 15).map(async (d) => {
      const history = await api(page, `/inventory/transactions?device_id=${d.id}&limit=50`);
      const inst = activeInstalls.find((i) => i.device_id === d.id);
      const photos = inst ? await api(page, `/photos?owner_type=installation&owner_id=${inst.id}`) : [];
      return { d, score: history.length + photos.length * 3 };
    }),
  );
  const showcase = scored.sort((a, b) => b.score - a.score)[0].d;
  const others = installed.filter((d) => d.id !== showcase.id);
  const customers = await api(page, '/customers');
  const models = await api(page, '/device-models');

  console.log('Dashboard and navigation');
  await step('02-dashboard', async () => {
    await go(page, '/dashboard', 2500);
    await shot(page, '02-dashboard');
  });
  await step('03-menu', async () => {
    await go(page, '/dashboard', 1500);
    await page.locator('.nav-btn').first().click();
    await shot(page, '03-menu', { wait: 1200 });
    await page.locator('.nav-btn').first().click();
    await sleep(500);
  });
  await step('04-command-palette', async () => {
    await go(page, '/dashboard', 1500);
    await page.locator('.search-trigger').click();
    await sleep(400);
    await page.keyboard.type(showcase.serial_number.slice(0, 3).toLowerCase());
    await shot(page, '04-command-palette', { wait: 900 });
    await page.keyboard.press('Escape');
  });

  console.log('Devices');
  await step('05-devices-list', async () => {
    await go(page, '/devices', 2000);
    await shot(page, '05-devices-list');
  });
  await step('06-device-new', async () => {
    await go(page, '/devices', 1500);
    await page.getByRole('button', { name: 'รับเข้าใหม่' }).click();
    const d = dialog(page);
    await d.waitFor();
    await type(d, 'หมายเลขซีเรียล', 'ZK-V5L-2001');
    await pick(page, d, 'รุ่นอุปกรณ์', 'SpeedFace');
    await type(d, 'MAC Address', '00:17:61:12:AB:01');
    await field(d, 'ต้นทุน').locator('input').first().fill('18500');
    await type(d, 'รหัสทรัพย์สิน', 'AT-2026-0101');
    await pick(page, d, 'ซื้อจากผู้จำหน่าย');
    await type(d, 'หมายเหตุ', 'ล็อตสั่งซื้อไตรมาส 3');
    await d.locator('.e-dlg-header').click();
    await shot(page, '06-device-new');
    await closeDialog(page);
  });
  await step('07-device-detail', async () => {
    await openDevice(page, showcase.id);
    await shot(page, '07-device-detail', { wait: 1500 });
  });
  await step('18-row-actions', async () => {
    await go(page, '/devices', 2000);
    await page.locator('.e-gridcontent .row-action[data-action=view]').nth(2).hover();
    await shot(page, '18-row-actions', { wait: 900 });
  });
  await step('08-transfer', async () => {
    const d = await deviceAction(page, (central[0] ?? inStock[0]).id, 'โอน');
    await pick(page, d, 'ปลายทาง');
    await d.locator('textarea').fill('ส่งมอบให้สาขาเชียงใหม่');
    await shot(page, '08-transfer');
    await closeDialog(page);
  });
  await step('09-checkout', async () => {
    const d = await deviceAction(page, tenantStock[0].id, 'เบิกออก');
    await d.locator('textarea').fill('เบิกให้ช่างสมชาย นำไปติดตั้ง');
    await shot(page, '09-checkout');
    await closeDialog(page);
  });
  await step('10-install', async () => {
    const d = await deviceAction(page, checkedOut[0].id, 'ติดตั้ง');
    await pick(page, d, 'ลูกค้า');
    await sleep(1500);
    const map = d.locator('app-installation-map');
    const box = await map.boundingBox();
    await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
    await type(d, 'ที่อยู่จุดติดตั้ง', 'อาคารสำนักงาน ชั้น 1 ประตูทางเข้าหลัก');
    await type(d, 'ผู้ติดต่อหน้างาน', 'คุณวิภา');
    await type(d, 'โทรศัพท์หน้างาน', '081-234-5678');
    await shot(page, '10-install', { wait: 1500 });
    await closeDialog(page);
  });
  await step('11-installed', async () => {
    await openDevice(page, showcase.id);
    await page.locator('.device-detail .install-card').scrollIntoViewIfNeeded();
    await shot(page, '11-installed', { wait: 1500 });
  });
  await step('12-timeline', async () => {
    await openDevice(page, showcase.id);
    await page.locator('.device-detail h3', { hasText: 'ประวัติความเคลื่อนไหว' }).scrollIntoViewIfNeeded();
    await page.locator('.device-detail .detail-body').evaluate((el) => el.scrollBy(0, 150));
    await shot(page, '12-timeline', { wait: 1200 });
  });
  await step('40-loan', async () => {
    const d = await deviceAction(page, tenantStock[0].id, 'ให้ยืม');
    const due = new Date(Date.now() + 14 * 86400_000);
    const dd = `${String(due.getDate()).padStart(2, '0')}/${String(due.getMonth() + 1).padStart(2, '0')}/${due.getFullYear()}`;
    await field(d, 'วันครบกำหนดคืน').locator('input').fill(dd);
    await d.locator('textarea').fill('ลูกค้าทดลองใช้ 2 สัปดาห์');
    await d.locator('.e-dlg-header').click();
    await shot(page, '40-loan');
    await closeDialog(page);
  });

  console.log('Bulk actions and labels');
  await step('45-bulk-bar', async () => {
    await go(page, '/devices', 1500);
    await page.locator('app-filter-chips button', { hasText: 'อยู่ในคลัง' }).first().click();
    await settle(page, 1200);
    const boxes = page.locator('.e-gridcontent tr.e-row .e-checkbox-wrapper .e-frame');
    for (let i = 4; i < 7; i++) await boxes.nth(i).click();
    await shot(page, '45-bulk-bar', { wait: 800 });
  });
  await step('46-bulk-transfer', async () => {
    await page.locator('.bulk-bar button', { hasText: 'โอน' }).first().click();
    const d = dialog(page);
    await d.waitFor();
    await pick(page, d, 'ปลายทาง');
    await d.locator('textarea').fill('จัดส่งล็อตเดือนตุลาคม');
    await shot(page, '46-bulk-transfer', { wait: 600 });
    await closeDialog(page);
  });
  await step('47-labels', async () => {
    await page.locator('.bulk-bar button', { hasText: 'พิมพ์ฉลาก' }).click();
    await dialog(page).waitFor();
    await shot(page, '47-labels', { wait: 1500 });
    await page.locator('.e-dialog.e-popup-open .e-dlg-closeicon-btn').last().click();
  });

  console.log('Repair, return, QC and retire');
  await step('13-send-repair', async () => {
    const d = await deviceAction(page, others[0].id, 'ส่งซ่อม');
    await pick(page, d, 'ผู้ซ่อม');
    await d.locator('textarea').fill('สแกนใบหน้าไม่ติด หน้าจอกะพริบ');
    await shot(page, '13-send-repair');
    await closeDialog(page);
  });
  await step('14-repair-done-required', async () => {
    const d = await deviceAction(page, inRepair[0].id, 'ซ่อมเสร็จ');
    await shot(page, '14-repair-done-required');
    await d.locator('textarea').fill('เปลี่ยนแผงกล้อง ทดสอบสแกน 20 ครั้งผ่านทั้งหมด');
    await shot(page, '15-repair-done');
    await closeDialog(page);
  });
  await step('16-return', async () => {
    const d = await deviceAction(page, others[1].id, 'รับคืน');
    await d.locator('textarea').fill('ลูกค้าย้ายสำนักงาน ส่งเครื่องคืนครบกล่อง');
    await shot(page, '16-return');
    await closeDialog(page);
  });
  await step('41-qc-fail', async () => {
    const d = await deviceAction(page, underQc[0].id, 'QC ไม่ผ่าน');
    await d.locator('textarea').fill('ปุ่มเปิดเครื่องค้าง ต้องเปลี่ยนสวิตช์');
    await shot(page, '41-qc-fail');
    await closeDialog(page);
  });
  await step('17-retire', async () => {
    const d = await deviceAction(page, inRepair[inRepair.length - 1].id, 'ปลดระวาง');
    await d.locator('textarea').fill('ซ่อมไม่คุ้มค่า เมนบอร์ดเสีย');
    await shot(page, '17-retire');
    await closeDialog(page);
  });

  console.log('Scan station');
  const scanFor = async (text) => {
    await page.locator('#scan-input').fill(text);
    await page.locator('.scan-form').evaluate((f) => f.requestSubmit());
    await settle(page, 1000);
  };
  await step('23-scan', async () => {
    await go(page, '/scan', 1200);
    await scanFor(others[2].serial_number);
    await scanFor(underQc[0].serial_number);
    await shot(page, '23-scan-found');
    await scanFor('ZK-UNKNOWN-999');
    await shot(page, '24-scan-missing');
  });
  await step('48-scan-batch', async () => {
    await go(page, '/scan', 1200);
    await page.locator('.scan-box ejs-checkbox .e-frame').click();
    for (const d of underQc.slice(0, 3)) await scanFor(d.serial_number);
    await shot(page, '48-scan-batch');
  });

  console.log('Transactions, customers and installations');
  await step('25-transactions', async () => {
    await go(page, '/transactions', 2000);
    await shot(page, '25-transactions');
  });
  await step('26-customers', async () => {
    await go(page, '/customers', 1500);
    await shot(page, '26-customers');
  });
  await step('27-customer-new', async () => {
    await go(page, '/customers', 1200);
    await page.getByRole('button', { name: 'เพิ่มลูกค้า' }).click();
    const d = dialog(page);
    await d.waitFor();
    await type(d, 'ชื่อบริษัท', 'บริษัท ตัวอย่างการค้า จำกัด');
    if (await field(d, 'กลุ่มลูกค้า').count()) await pick(page, d, 'กลุ่มลูกค้า');
    await type(d, 'ผู้ติดต่อ', 'คุณสมศรี ใจดี');
    await type(d, 'โทรศัพท์', '02-123-4567');
    await type(d, 'อีเมล', 'somsri@example.com');
    await type(d, 'เลขประจำตัวผู้เสียภาษี', '0105561234567');
    await type(d, 'ที่อยู่', '99/1 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310');
    await d.locator('.e-dlg-header').click();
    await shot(page, '27-customer-new');
    await closeDialog(page);
  });
  await step('49-customer-detail', async () => {
    const summaries = await Promise.all(customers.slice(0, 12).map((c) => api(page, `/customers/${c.id}`)));
    const best = summaries.sort((a, b) => (b.summary?.active_installations ?? 0) - (a.summary?.active_installations ?? 0))[0];
    await go(page, `/customers/${best.id}`, 3000);
    await shot(page, '49-customer-detail', { wait: 1500 });
  });
  await step('28-installations', async () => {
    await go(page, '/installations', 3000);
    await shot(page, '28-installations', { wait: 1500 });
  });
  await step('29-installations-nearby', async () => {
    await go(page, '/installations', 2500);
    const map = page.locator('.panel.map app-installation-map');
    await map.scrollIntoViewIfNeeded();
    await page.locator('.panel.nearby').scrollIntoViewIfNeeded();
    const box = await map.boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await sleep(500);
    await page.locator('.panel.nearby button', { hasText: 'ค้นหา' }).click();
    await settle(page, 2500);
    await shot(page, '29-installations-nearby', { wait: 1000 });
  });

  console.log('Settings, audit and reports');
  await step('30-device-models', async () => {
    await go(page, '/admin/device-models', 2000);
    await shot(page, '30-device-models');
  });
  await step('42-suppliers', async () => {
    await go(page, '/admin/suppliers', 1500);
    await shot(page, '42-suppliers');
  });
  await step('31-tenants', async () => {
    await go(page, '/admin/tenants', 1500);
    await shot(page, '31-tenants');
  });
  await step('32-users', async () => {
    await go(page, '/admin/users', 1500);
    await shot(page, '32-users');
  });
  await step('33-user-new', async () => {
    await go(page, '/admin/users', 1200);
    await page.getByRole('button', { name: 'เพิ่มผู้ใช้' }).click();
    const d = dialog(page);
    await d.waitFor();
    await type(d, 'ชื่อ-นามสกุล', 'สมหญิง รักงาน');
    await type(d, 'อีเมล', 'somying@example.com');
    await pick(page, d, 'บทบาท', 'เจ้าหน้าที่');
    await sleep(300);
    if (await field(d, 'กลุ่มลูกค้า').count()) await pick(page, d, 'กลุ่มลูกค้า');
    await d.locator('input[type=password]').first().fill('Welcome-2026');
    await d.locator('.e-dlg-header').click();
    await shot(page, '33-user-new');
    await closeDialog(page);
  });
  await step('50-audit', async () => {
    await go(page, '/admin/audit', 1800);
    await shot(page, '50-audit');
  });
  await step('43-reports', async () => {
    await go(page, '/reports', 2500);
    await shot(page, '43-reports-balance');
    await page.getByText('อายุในสถานะ', { exact: true }).first().click();
    await settle(page, 1800);
    await shot(page, '44-reports-aging');
  });

  console.log('Profile and theme');
  await step('34-user-menu', async () => {
    await go(page, '/dashboard', 1500);
    await page.locator('button.user-menu').click();
    await shot(page, '34-user-menu', { wait: 700 });
    await page.keyboard.press('Escape');
  });
  await step('35-profile', async () => {
    await go(page, '/profile', 1500);
    await shot(page, '35-profile');
  });
  await step('36-dashboard-dark', async () => {
    await page.evaluate(() => localStorage.setItem('inventory.theme', 'dark'));
    await go(page, '/dashboard', 2500);
    await shot(page, '36-dashboard-dark');
    await page.evaluate(() => localStorage.setItem('inventory.theme', 'light'));
  });

  console.log('Mobile');
  await step('37-mobile', async () => {
    const mobile = await browser.newContext({
      viewport: MOBILE,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'th-TH',
      timezoneId: 'Asia/Bangkok',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      storageState: await context.storageState(),
    });
    const m = await mobile.newPage();
    await go(m, '/dashboard', 2500);
    await shot(m, '37-mobile-dashboard');
    await m.locator('.nav-btn').first().click();
    await shot(m, '38-mobile-menu', { wait: 900 });
    await go(m, '/devices', 2000);
    await shot(m, '39-mobile-devices');
    await mobile.close();
  });

  console.log('Import');
  await step('19-import', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-'));
    const model = `${models[0].brand} ${models[0].name}`;
    const stamp = Date.now().toString(36).toUpperCase();
    const bad = path.join(tmp, 'devices-with-errors.csv');
    const good = path.join(tmp, 'devices.csv');
    fs.writeFileSync(
      bad,
      `ซีเรียล,รุ่น,MAC,วันที่ซื้อ,ต้นทุน\n${showcase.serial_number},${model},,2026-09-01,15000\nGUIDE-${stamp}-X,ไม่มีรุ่นนี้,ZZ:11,2026-09-01,15000\nGUIDE-${stamp}-1,${model},00:17:61:AA:00:01,2026-09-01,15000\n`,
    );
    fs.writeFileSync(
      good,
      `ซีเรียล,รุ่น,MAC,วันที่ซื้อ,ต้นทุน\nGUIDE-${stamp}-1,${model},00:17:61:AA:00:01,2026-09-01,15000\nGUIDE-${stamp}-2,${model},00:17:61:AA:00:02,2026-09-01,15000\n`,
    );
    await go(page, '/devices', 1500);
    await page.getByRole('button', { name: 'นำเข้า' }).click();
    await dialog(page).waitFor();
    await shot(page, '19-import-step1', { wait: 800 });
    await dialog(page).locator('input[type=file]').setInputFiles(bad);
    await page.locator('.import-dialog .preview').waitFor();
    await shot(page, '20-import-errors', { wait: 800 });
    await page.locator('.import-dialog button', { hasText: 'เลือกไฟล์ใหม่' }).click();
    await sleep(500);
    await dialog(page).locator('input[type=file]').setInputFiles(good);
    await page.locator('.import-dialog button', { hasText: 'นำเข้า 2 เครื่อง' }).waitFor();
    await shot(page, '21-import-valid', { wait: 800 });
    await page.locator('.import-dialog button', { hasText: 'นำเข้า 2 เครื่อง' }).click();
    await page.locator('.import-dialog .done').waitFor();
    await shot(page, '22-import-done', { wait: 800 });
    await page.locator('.import-dialog button', { hasText: 'เสร็จสิ้น' }).click();
  });

  await browser.close();
  if (failures.length) {
    console.log(`\nFailed: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll screenshots captured.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
