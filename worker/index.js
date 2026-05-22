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

/**
 * Parse a legacy `?id={repo}@{org}@{git_host}` value into its three tokens.
 * Returns null when the input is missing, doesn't contain exactly three
 * @-separated tokens, or any token is empty. Per REQ:legacy-id-redirect.
 */
function parseLegacyId(id) {
  if (!id) return null;
  const tokens = id.split('@');
  if (tokens.length !== 3) return null;
  const [repo, org, git_host] = tokens;
  if (!repo || !org || !git_host) return null;
  return { repo, org, git_host };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const original = url.pathname;

    // Legacy URL handling (REQ:legacy-id-redirect). MUST run before the
    // /app/ asset logic so the 302 is emitted at the edge — before the SPA
    // bootstrap — so link unfurlers, OG scrapers, and the CDN observe the
    // canonical URL on the response.
    if (original === '/project') {
      const parsed = parseLegacyId(url.searchParams.get('id'));
      if (parsed) {
        const location = `/app/project/${parsed.git_host}/${parsed.org}/${parsed.repo}`;
        return withSecurityHeaders(
          new Response(null, { status: 302, headers: { Location: location } }),
        );
      }
      // Malformed id (missing, wrong token count, empty tokens): per
      // AC:legacy-id-malformed-rejected, do NOT redirect. Fall through to
      // the SPA fallback so UnsupportedSourceComponent renders client-side.
      const indexUrl = new URL(request.url);
      indexUrl.pathname = '/index.html';
      const fallback = await env.ASSETS.fetch(new Request(indexUrl, request));
      return withSecurityHeaders(fallback);
    }

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
