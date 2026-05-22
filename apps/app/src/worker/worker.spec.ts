// Unit tests for the Cloudflare Worker (worker/index.js). The Worker isn't
// part of the Angular bundle but it lives in the same repo and ships as
// part of the same release — co-locating its tests under apps/app/src
// keeps it discoverable by the existing Vitest configuration without
// standing up a second test project. A CI-time Playwright assertion
// against a deployed preview is a follow-up per the Plan.

import { vi } from 'vitest';
// The Worker lives at /worker/index.js (a sibling deployment unit), not
// inside any Nx project. Co-locating its spec under apps/app/src keeps it
// discoverable by the existing Vitest configuration without a dedicated
// test project — at the cost of crossing Nx's module boundary and TS
// inability to type a JS import, which we suppress here intentionally.
// @ts-expect-error JS module imported into a TS spec; types aren't needed here.
// eslint-disable-next-line @nx/enforce-module-boundaries
import worker from '../../../../worker/index.js';

interface AssetsBinding {
  fetch: (req: Request) => Promise<Response>;
}

function mockEnv(response: Response): { ASSETS: AssetsBinding; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn().mockResolvedValue(response);
  return { ASSETS: { fetch: spy }, spy };
}

describe('worker fetch handler — Referrer-Policy header (REQ:referrer-policy-strict-origin)', () => {
  it('appends Referrer-Policy: strict-origin to the app entry response', async () => {
    const { ASSETS } = mockEnv(
      new Response('<html><head></head><body></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const response = await worker.fetch(new Request('https://specscore.studio/app/'), { ASSETS });
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin');
  });

  it('appends Referrer-Policy: strict-origin to canonical /app/project/... responses', async () => {
    const { ASSETS } = mockEnv(
      new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const response = await worker.fetch(
      new Request('https://specscore.studio/app/project/github.com/specscore/specscore'),
      { ASSETS },
    );
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin');
  });

  it('appends Referrer-Policy: strict-origin to static asset responses', async () => {
    const { ASSETS } = mockEnv(
      new Response('body { color: red; }', {
        status: 200,
        headers: { 'Content-Type': 'text/css' },
      }),
    );
    const response = await worker.fetch(
      new Request('https://specscore.studio/app/styles.css'),
      { ASSETS },
    );
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin');
  });

  it('appends Referrer-Policy: strict-origin to the SPA fallback response (404 → index.html)', async () => {
    // First ASSETS.fetch returns 404; the worker then re-fetches /index.html.
    const indexResponse = new Response('<html><body>SPA</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    const spy = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(indexResponse);
    const response = await worker.fetch(
      new Request('https://specscore.studio/app/some/spa/route'),
      { ASSETS: { fetch: spy } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin');
  });

  it('preserves existing response headers when adding Referrer-Policy', async () => {
    const { ASSETS } = mockEnv(
      new Response('asset body', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' },
      }),
    );
    const response = await worker.fetch(
      new Request('https://specscore.studio/app/foo.txt'),
      { ASSETS },
    );
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin');
    expect(response.headers.get('Content-Type')).toBe('text/plain');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
