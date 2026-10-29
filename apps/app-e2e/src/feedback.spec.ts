import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
type TestWindow = Window & { __feedbackRoot?: ShadowRoot; __feedbackMessages: {theme?: string}[]; ImproveIt?: object };
const ORIGIN = 'https://specscore.studio', APP = '75251aa279608b533e93a785f5ae3aee';
const CANARY = 'PRIVATE_URL_TOKEN_CALLBACK_VAULT_ACCOUNT_FORM_7261';
const PUBLIC = path.resolve(__dirname, '../../../dist/apps/app/browser');
const SDK = readFileSync(path.resolve(__dirname, '../../../test/fixtures/improveit-widget.js'), 'utf8');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const button = (page: Page) => page.locator('.product-feedback');
type Hit = { url: string; method: string; headers: Record<string, string>; body: string | null };
function allowed(hit: Hit, screen: string) {
  const url = new URL(hit.url);
  expect(hit.method).toBe('GET'); expect(url.origin).toBe('https://improveit.now');
  expect(hit.headers['referer'], url.pathname + ' referrer').toBeUndefined(); expect(hit.body).toBeNull();
  expect(JSON.stringify(hit)).not.toContain(CANARY);
  if (url.pathname === '/widget.js') expect(url.search).toBe('');
  else {
    expect(url.pathname).toBe('/widget'); expect(url.hash).toBe('');
    expect(Object.fromEntries(url.searchParams)).toEqual({ app: APP, space: 'ao58m', screen, theme: 'light' });
  }
}
async function boot(page: Page, options: { failFirst?: boolean; hold?: Promise<void>; foreign?: boolean } = {}) {
  const hits: Hit[] = []; let loads = 0;
  await page.addInitScript(({ foreign }) => {
    const win = window as unknown as TestWindow, original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = original.call(this, options); if (this.hasAttribute('data-improveit-host')) win.__feedbackRoot = root; return root;
    };
    win.__feedbackMessages = [];
    window.addEventListener('message', e => {
      if (e.origin === 'https://improveit.now' && e.data?.type === 'fixture:received') win.__feedbackMessages.push(e.data.value);
    });
    if (foreign) win.ImproveIt = Object.freeze({ open() { throw new Error('foreign API called'); } });
  }, { foreign: options.foreign });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'https://improveit.now') {
      hits.push({ url: request.url(), method: request.method(), headers: await request.allHeaders(), body: request.postData() });
      if (url.pathname === '/widget.js') {
        loads++; if (options.failFirst && loads === 1) return route.abort(); if (options.hold) await options.hold;
        return route.fulfill({ contentType: 'text/javascript', body: SDK });
      }
      if (url.pathname === '/widget') return route.fulfill({ contentType: 'text/html', body: `<html><body>Local transport fixture<script>addEventListener('message',e=>parent.postMessage({type:'fixture:received',value:e.data},'${ORIGIN}'));parent.postMessage({type:'improveit:ready'},'${ORIGIN}');</script></body></html>` });
      return route.abort();
    }
    if (url.origin !== ORIGIN) return route.abort();
    let file = path.join(PUBLIC, url.pathname.replace(/^\/app\//, ''));
    if (!existsSync(file) && !['.js', '.css', '.svg', '.png', '.woff2', '.ico'].includes(path.extname(file))) file = path.join(PUBLIC, 'index.html');
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) });
  });
  return { hits, loads: () => loads };
}
async function idle(page: Page) {
  await expect(button(page)).toBeVisible();
  await expect(page.locator('script[src^="https://improveit.now"],iframe[src^="https://improveit.now"],link[href^="https://improveit.now"]')).toHaveCount(0);
}
async function open(page: Page) {
  await button(page).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as TestWindow).__feedbackRoot?.querySelector('dialog')?.open))).toBe(true);
}
async function settle(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function saveScreenshot(page: Page, name: string) {
  const directory = process.env['WIDGET_ARTIFACT_DIR'];
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name) });
}
async function assertContrast(page: Page) {
  const ratio = await button(page).evaluate(el => {
    const style = getComputedStyle(el);
    const luminance = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      .map(value => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

test('oracle rejects POSTs, unknown URLs, private query fields, wrong origins and referrers', () => {
  const base = { url: 'https://improveit.now/widget.js', method: 'GET', headers: {}, body: null };
  allowed(base, 'specscore-studio');
  for (const bad of [{ ...base, method: 'POST' }, { ...base, url: 'https://improveit.now/unknown' },
    { ...base, url: `https://improveit.now/widget.js?token=${CANARY}` }, { ...base, url: 'https://unexpected.example/widget.js' },
    { ...base, headers: { referer: `${ORIGIN}/connect?token=${CANARY}` } }, { ...base, body: CANARY }]) {
    expect(() => allowed(bad, 'specscore-studio')).toThrow();
  }
  expect(createHash('sha256').update(SDK).digest('hex')).toBe('a0d1d885b2ac5dd95a323471f9caa9e14ad97388dbad70c6986ce0e230bb0e33');
});

for (const documentPath of ['/app/', `/app/github.com/${CANARY}/private-repo/spec/features/private.md`, `/app/~${CANARY}/private-document`]) {
  test(`${documentPath} exposes a click lazy local launcher with fixed context`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: 'dark' }); const network = await boot(page);
    await page.goto(`${ORIGIN}${documentPath}?token=${CANARY}#${CANARY}`);
    await idle(page); await assertContrast(page);
    await page.evaluate(value => {
      document.title = value;
      const input = document.createElement('textarea'); input.id = 'private-canary'; input.value = value;
      const privateDom = document.createElement('p'); privateDom.textContent = value;
      document.body.prepend(input, privateDom);
    }, CANARY);
    await page.locator('#private-canary').fill(`${CANARY}_EDITOR`);
    await button(page).focus(); await page.keyboard.press('Tab'); await settle(page); expect(network.hits).toEqual([]);
    await page.evaluate(() => { history.pushState({}, '', '/app/unsupported-source?private=route#private'); dispatchEvent(new PopStateEvent('popstate')); });
    await idle(page); await assertContrast(page); expect(network.hits).toEqual([]);
    await button(page).focus(); await page.keyboard.press('Enter');
    await expect.poll(() => network.hits.length).toBe(2);
    await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).__feedbackMessages.length)).toBeGreaterThan(0);
    for (const hit of network.hits) allowed(hit, 'specscore-studio');
    expect(await page.evaluate(() => JSON.stringify((window as unknown as TestWindow).__feedbackMessages))).not.toContain(CANARY);
    await page.keyboard.press('Escape'); await expect(button(page)).toBeFocused();
    await open(page); expect(network.loads()).toBe(1); await page.keyboard.press('Escape');
    await page.keyboard.press('Tab'); await button(page).focus();
    const box = await button(page).evaluate(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, bottom: r.bottom, height: r.height, width: innerWidth, viewport: innerHeight,
        outline: getComputedStyle(el).outlineStyle, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el };
    });
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(box.width);
    expect(box.height).toBeGreaterThanOrEqual(48); expect(box.bottom).toBeLessThanOrEqual(box.viewport);
    expect(box.hit).toBe(true); expect(box.outline).toBe('solid');
    await saveScreenshot(page, `studio-${testInfo.project.name}-${testInfo.testId}.png`);
  });
}

test('failed SDK download requires explicit retry and preserves initiating keyboard focus', async ({ page }) => {
  const network = await boot(page, { failFirst: true }); await page.goto(`${ORIGIN}/app/`); await idle(page); await assertContrast(page);
  await button(page).focus(); await page.keyboard.press('Enter'); await expect(button(page)).toHaveText('Feedback unavailable · Retry');
  await page.evaluate(() => { history.pushState({}, '', '/app/unsupported-source'); dispatchEvent(new PopStateEvent('popstate')); });
  await button(page).focus(); await settle(page); expect(network.loads()).toBe(1);
  await page.keyboard.press('Enter');
  await expect.poll(() => network.hits.length).toBe(3);
  await page.keyboard.press('Escape'); await expect(button(page)).toBeFocused();
  for (const hit of network.hits) allowed(hit, 'specscore-studio');
});

test('foreign SDK global is never called, overwritten or granted a frame', async ({ page }) => {
  const network = await boot(page, { foreign: true }); await page.goto(`${ORIGIN}/app/`); await button(page).click();
  await expect(button(page)).toBeHidden(); expect(network.hits).toEqual([]);
  expect(await page.evaluate(() => Object.isFrozen((window as unknown as TestWindow).ImproveIt))).toBe(true);
});

test('host effective theme wins over opposite OS and updates an open runtime', async ({ page }) => {
  const network = await boot(page); await page.emulateMedia({ colorScheme: 'dark' }); await page.goto(`${ORIGIN}/app/`);
  await open(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).__feedbackMessages.length)).toBeGreaterThan(0);
  expect(new URL(network.hits[1].url).searchParams.get('theme')).toBe('light');
  await page.evaluate(() => document.documentElement.classList.add('app-dark'));
  await assertContrast(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).__feedbackMessages.at(-1)?.theme)).toBe('dark');
  expect(network.loads()).toBe(1); expect(network.hits).toHaveLength(2);
});
