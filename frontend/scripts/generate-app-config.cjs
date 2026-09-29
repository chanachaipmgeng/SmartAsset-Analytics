#!/usr/bin/env node
/**
 * Writes public/app-config.json (gitignored) from environment variables.
 *
 * Env: SYNCFUSION_LICENSE, API_BASE_URL (optional)
 * Pass --require or REQUIRE_SYNCFUSION_LICENSE=true to fail when the license is empty.
 */
const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'public', 'app-config.json');
const require_ = process.argv.includes('--require') || process.env.REQUIRE_SYNCFUSION_LICENSE === 'true';

let current = {};
if (fs.existsSync(target)) {
  try {
    current = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    current = {};
  }
}

const license = (process.env.SYNCFUSION_LICENSE ?? current.syncfusionLicense ?? '').trim();
if (require_ && !license) {
  console.error('SYNCFUSION_LICENSE is required but empty.');
  process.exit(1);
}

const config = {
  apiBaseUrl: (process.env.API_BASE_URL ?? current.apiBaseUrl ?? '').trim(),
  syncfusionLicense: license,
};

fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
console.log(`Wrote ${path.relative(process.cwd(), target)} (license ${license ? 'set' : 'empty'}).`);
