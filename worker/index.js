// Cloudflare Worker for specscore-studio-app
//
// Why this Worker exists
// ----------------------
// The Angular app is deployed under the URL prefix `/app/` (see baseHref in
// apps/app/project.json) and Cloudflare routes `specscore.studio/app/*` to
// this Worker. But the built static assets live at `dist/apps/app/browser/`
// WITHOUT an `/app/` segment in their paths — so the Worker has to strip the
// `/app/` prefix before delegating to the ASSETS binding, otherwise every
// resource 404s and SPA-fallback loops.
//
// Also handles client-side routing: on 404, serve /index.html so Angular's
// router can take over.
//
// The Astro marketing site (specscore-studio) keeps its catch-all route
// `specscore.studio/*` unchanged. Cloudflare's more-specific route wins, so
// `/app/*` requests come here and everything else falls through to studio.
//
// Security headers
// ----------------
// Every response carries `Referrer-Policy: strict-origin` per
// REQ:referrer-policy-strict-origin (spec/features/studio-url-scheme). This
// prevents private {org}/{repo}/{path} segments from leaking via the Referer
// header when a user follows a third-party link out of Studio.

const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin',
};

/** Clone a Response and append the security headers. */
function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const original = url.pathname;

    // Strip /app prefix for asset lookup. The exact `/app` and `/app/` cases
    // become the app's index.html directly.
    if (original === '/app' || original === '/app/') {
      url.pathname = '/index.html';
    } else if (original.startsWith('/app/')) {
      url.pathname = original.slice(4); // remove '/app', keep trailing '/...'
    }

    const assetResponse = await env.ASSETS.fetch(new Request(url, request));

    // SPA fallback: serve /index.html on 404 so Angular's client-side router
    // can handle the route.
    if (assetResponse.status === 404) {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = '/index.html';
      const fallback = await env.ASSETS.fetch(new Request(indexUrl, request));
      return withSecurityHeaders(fallback);
    }

    return withSecurityHeaders(assetResponse);
  },
};
