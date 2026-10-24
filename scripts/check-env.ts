#!/usr/bin/env node
/**
 * Checks the app's PUBLIC configuration before a build without printing any value.
 *
 *   npm run env:check                 # reads process.env, then .env.local / .env if present
 *   npm run env:check -- --file path  # a specific env file (e.g. exported EAS values)
 *   npm run env:check -- --release    # missing values are errors (store builds)
 *
 * Exit code 1 when a value is dangerous (secret key in the app) or, with --release, missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  checkRevenueCatKey,
  checkSupabaseAnonKey,
  checkSupabaseUrl,
  type CheckResult,
} from '../src/lib/configCheck.ts';

const { values } = parseArgs({
  options: { file: { type: 'string' }, release: { type: 'boolean', default: false } },
});

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const files = values.file ? [values.file] : ['.env.local', '.env'].filter((f) => existsSync(f));
const env: Record<string, string> = {};
for (const f of files.reverse()) Object.assign(env, parseEnvFile(f));
for (const [k, v] of Object.entries(process.env)) if (k.startsWith('EXPO_PUBLIC_') && v) env[k] = v;

const get = (k: string) => env[k] ?? '';
const rows: [string, CheckResult][] = [
  ['EXPO_PUBLIC_SUPABASE_URL', checkSupabaseUrl(get('EXPO_PUBLIC_SUPABASE_URL'))],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', checkSupabaseAnonKey(get('EXPO_PUBLIC_SUPABASE_ANON_KEY'))],
  [
    'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
    checkRevenueCatKey(get('EXPO_PUBLIC_REVENUECAT_IOS_KEY'), 'ios'),
  ],
  [
    'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
    checkRevenueCatKey(get('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'), 'android'),
  ],
];

let failed = false;
console.log(`env files: ${files.length ? files.join(', ') : '(none)'}`);
for (const [name, r] of rows) {
  const missing = !get(name);
  // a wrong value is always an error; a missing one only for release builds
  const error = !r.ok && (!missing || values.release);
  if (error) failed = true;
  console.log(`${r.ok ? 'OK ' : error ? 'NG ' : '-- '} ${name}${r.ok ? '' : `: ${r.problem}`}`);
}

// Server-only secrets must never be in the app bundle (EXPO_PUBLIC_*).
for (const [k, v] of Object.entries(env)) {
  if (!k.startsWith('EXPO_PUBLIC_')) continue;
  if (/^(sk_|sb_secret_)/.test(v) || /SERVICE_ROLE|SECRET|WEBHOOK/i.test(k)) {
    console.log(`NG  ${k}: 秘密情報をアプリ（EXPO_PUBLIC_*）に入れないでください`);
    failed = true;
  }
}

if (failed) {
  console.log('\n設定に問題があります。docs/USER_ACTIONS.md を参照してください。');
  process.exit(1);
}
console.log(
  '\n公開設定の形式に問題はありません（値そのものの正しさは接続テストで確認してください）。',
);
