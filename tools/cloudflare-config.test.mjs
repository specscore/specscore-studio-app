// Deploy-config checks for the assets-only Cloudflare Worker (no Worker script).
// Run with `node --test tools/*.test.mjs` (CI does).
// REQ:referrer-policy-strict-origin (spec/features/studio-url-scheme): every response
// must carry `Referrer-Policy: strict-origin`; that is now a static `_headers` rule
// (cloudflare/_headers, copied to the asset root by tools/mount-app-shell.mjs).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

test('Referrer-Policy: strict-origin on every path via _headers (REQ:referrer-policy-strict-origin)', () => {
  const lines = read('cloudflare/_headers')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));
  assert.deepEqual(lines, ['/*', '  Referrer-Policy: strict-origin']);
});

test('no Worker script; unmatched navigations get the SPA shell', () => {
  const config = JSON.parse(
    read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''),
  );
  assert.equal(config.main, undefined);
  assert.equal(config.assets.run_worker_first, undefined);
  assert.equal(config.assets.not_found_handling, 'single-page-application');
  assert.equal(existsSync(resolve(root, 'worker')), false);
  assert.deepEqual(
    config.routes.map((r) => r.pattern),
    ['specscore.studio/app', 'specscore.studio/app/*'],
  );
});

test('Angular output is built under the /app/ mount path', () => {
  const options = JSON.parse(read('apps/app/project.json')).targets['build-app']
    .options;
  assert.equal(options.baseHref, '/app/');
  assert.deepEqual(options.outputPath, {
    base: 'dist/apps/app/browser/app',
    browser: '',
  });
});

test('nx build app itself emits the root index.html and _headers (Workers Builds ignores build.command)', () => {
  const cfg = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(cfg.build, undefined);
  const build = JSON.parse(read('apps/app/project.json')).targets.build;
  assert.equal(build.executor, 'nx:run-commands');
  for (const c of [build.options, build.configurations.production, build.configurations.development]) {
    assert.ok(c.commands.at(-1).includes('tools/mount-app-shell.mjs'));
  }
});
