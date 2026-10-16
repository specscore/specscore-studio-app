// Prepares dist/apps/app/browser for Cloudflare static assets (assets-only Worker).
//
// The Angular app is built with baseHref `/app/` and outputPath base
// `dist/apps/app/browser/app`, so every asset sits under `/app/...` exactly as it is requested
// (specscore.studio/app/* is routed to this Worker). Two files must live at the
// asset ROOT, outside the Angular output:
//   index.html — a copy of app/index.html. `not_found_handling:
//                "single-page-application"` serves /index.html (200) for any
//                navigation that matches no file, so deep links load the shell.
//   _headers   — from cloudflare/_headers (Referrer-Policy).
// Run by `wrangler deploy` / `wrangler dev` via `build.command` in wrangler.jsonc,
// after `nx build app`. Idempotent.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = join(root, 'dist/apps/app/browser');
const shell = join(browser, 'app/index.html');

if (!existsSync(shell)) {
  console.error(`Missing ${shell}. Run \`pnpm exec nx build app\` first.`);
  process.exit(1);
}
copyFileSync(shell, join(browser, 'index.html'));
copyFileSync(join(root, 'cloudflare/_headers'), join(browser, '_headers'));
console.log('Mounted app shell: dist/apps/app/browser/{index.html,_headers}');
