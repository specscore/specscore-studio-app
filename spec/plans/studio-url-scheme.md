# Plan: Studio URL Scheme

**Status:** Approved
**Source Feature:** studio-url-scheme
**Date:** 2026-05-22
**Owner:** alexander.trakhimenok@gmail.com
**Supersedes:** —

## Summary

Implements the canonical Studio URL contract on the studio-app side per the approved [studio-url-scheme](../features/studio-url-scheme/README.md) Feature, which in turn implements ADR [D-0001 — Studio Deep-Link URL Scheme](https://specscore.studio/app/github.com/specscore/specscore/spec/decisions/0001-studio-url-scheme.md). Tasks 1–9 built out the original D-0001 shape (`/app/project/{git_host}/...`) end-to-end; Tasks 10–11 migrate the implementation to the amended D-0001 shape (`/app/{git_host}/...` with `#page=` view hash). The plan now spans the route-guard core, the security pipeline (allow-list, path validation, hardcoded fetch base), handle-namespace reservation, query parameters, response headers, Referer-based ref inference, the cross-repo handoff for the one producer-side AC, and the post-amendment migration of the routing root.

## Approach

Tasks are grouped by the surface they touch. Tasks 1–5 built out the Angular `url-scheme.guard.ts` incrementally — scaffolding first, then layering in allow-list, path validation, handle parsing, and query-parameter extraction — so each intermediate step was independently testable. Task 6 isolated the outbound-fetch boundary that the guard hands off to. Task 7 is a Cloudflare Worker concern kept separate because it ships via `worker/index.js` rather than the Angular application bundle. Task 8 (Referer-based ref inference) landed last per the Feature's Outstanding Questions sequencing note, so v1 could validate against real referrer data before extending the parser set. Task 9 is a tracking/handoff record for the one AC whose enforcement lives in the `specscore` CLI in another repo.

**Same-day D-0001 amendment.** After Tasks 1–9 landed, implementation surfaced a route-collision pain in the original `/app/project/` namespace (literal Studio sub-routes like `/project/features` shadowing the canonical `:git_host/:org/:repo` matcher). D-0001 was amended in place to drop the `/project/` prefix and use a first-segment dot-distinguisher dispatch rule; the studio-toolbar Feature in the `specscore` repo and the CLI URL emitter in `specscore-cli` were updated to match. Tasks 10–11 below migrate this studio-app implementation to the amended shape.

The pre-canonical `/project?id={repo}@{org}@{git_host}` URL form is dropped without an edge-level migration bridge — see the Feature's Not Doing / Out of Scope section. Existing links must be updated by their authors.

## Tasks

### Task 1: URL-scheme route guard scaffolding + path canonical route

**Verifies:** studio-url-scheme#ac:path-canonical-resolves

Add `apps/app/src/app/core/routing/url-scheme.guard.ts` and wire the canonical path route `/app/project/:git_host/:org/:repo/**` under the existing app shell. The guard parses positional segments (`{git_host}`, `{org}`, `{repo}`, trailing `{path}`) and exposes them to the project page component. No host or path validation in this task — those layers land in Tasks 2 and 3. The route resolves to the project page with the parsed coordinates; the project page's own behavior (README fetch, sidebar) is unchanged.

### Task 2: Forge-host allow-list with IDNA normalization

**Verifies:** studio-url-scheme#ac:unknown-host-rejected, studio-url-scheme#ac:homoglyph-host-rejected

Add `apps/app/src/app/core/routing/forge-host.allowlist.ts` exporting the maintained set `{github.com, gitlab.com, bitbucket.org, codeberg.org}` and an `isAllowedForgeHost(input: string): boolean` that IDNA-normalizes the input (NFC + lowercase + punycode resolution) before comparison. Wire the check into `url-scheme.guard.ts` from Task 1: when the host fails the check, the guard routes to a new `UnsupportedSourceComponent` rendered at `apps/app/src/app/pages/project/unsupported-source.ts` instead of the normal project chrome. The component shows a static "Unsupported source" message; copy can be refined later (see the Feature's Outstanding Question on UX wording).

### Task 3: Path validation pipeline in the route guard

**Verifies:** studio-url-scheme#ac:path-decoded-once, studio-url-scheme#ac:path-traversal-rejected, studio-url-scheme#ac:null-byte-rejected, studio-url-scheme#ac:encoded-slash-rejected

Extend `url-scheme.guard.ts` with a single path-validation step that runs after allow-list (Task 2) succeeds. The pipeline decodes `{path}` exactly once and rejects any segment that contains `..`, a single `.`, a null byte (`%00` decoded to U+0000), control characters (U+0000–U+001F or U+007F), or an encoded forward slash (`%2F`). On rejection, route to `UnsupportedSourceComponent`. Decoding lives in this guard and only in this guard; downstream consumers receive the already-decoded `{path}` and MUST NOT re-decode.

### Task 4: Handle-namespace parsing

**Verifies:** studio-url-scheme#ac:handle-canonical-parses, studio-url-scheme#ac:handle-with-dot-rejected

Extend `url-scheme.guard.ts` to recognize a leading `~` on the first path segment. When present, parse the remainder as `{handle}` (must not contain `.`) and treat segment 2 as `{project-slug}`. A `~{handle}` containing a dot routes to `UnsupportedSourceComponent`. Successful handle parses dispatch to the same project-page component as the path shape, but with `{handle, project-slug}` coordinates instead of `{git_host, org, repo}` — the actual resolution from handle to forge repository is deferred to a future feature (the Feature's REQ:handle-no-dots already records the constraint).

### Task 5: Query parameter contract: `?ref` and `?op`

**Verifies:** studio-url-scheme#ac:ref-pins-to-branch, studio-url-scheme#ac:ref-defaults-to-head, studio-url-scheme#ac:op-routes-to-operation

Extend `url-scheme.guard.ts` to extract `?ref` and `?op` from the route's `queryParamMap` and pass them alongside the parsed coordinates to the project page component. URL-decode `?ref` once (preserving `/`). When `?ref` is absent, the guard exposes `ref: undefined` and the page resolves at the repository's default branch via its existing GitHub API call. When `?op` is present, the project page selects the matching operation view (initial set: `explore`, `edit`, `ask`, `request-change`); the operation views themselves MAY ship as stubs in this task, but each stub MUST render an observable mode indicator (e.g. a `data-op="explore"` attribute on the page root or a small mode label in the header) so AC:op-routes-to-operation can be asserted in tests against something that visibly differs from the default read view.

### Task 6: Hardcoded forge-API base URL mapping

**Verifies:** studio-url-scheme#ac:no-fetch-host-templating

Add `apps/app/src/app/core/routing/forge-api-base.ts` exporting `forgeApiBase(host: string): string` that maps each allow-listed forge host to its hardcoded API base (e.g. `github.com → https://api.github.com`). Audit existing GitHub fetch call sites (the project page's `githubService.fetchReadmeHtml`) to confirm they consume the mapped base rather than templating `{git_host}` into a URL. Add a unit test that synthesizes a parsed coordinate set with an attacker-style `{git_host}` (e.g. `127.0.0.1`, `169.254.169.254`) and asserts the outbound fetch URL does not embed it.

### Task 7: `Referrer-Policy: strict-origin` site-wide

**Verifies:** studio-url-scheme#ac:referrer-policy-header-set

Studio-app is served by a Cloudflare Worker (`worker/index.js`, configured in `wrangler.jsonc`). Extend the existing `fetch` handler so every response it returns carries `Referrer-Policy: strict-origin`. The simplest implementation is to clone the asset response and append the header via `new Response(body, { ...init, headers: { ..., 'Referrer-Policy': 'strict-origin' } })` before returning. Apply uniformly — the canonical `/app/project/...` routes, the SPA fallback `index.html`, and static asset responses must all carry the header. Verify via a Playwright or curl-based assertion in CI that the header appears on responses for `/app`, `/app/project/github.com/...`, and a static asset.

### Task 8: Client-side Referer-based ref inference (GitHub parser)

**Verifies:** studio-url-scheme#ac:ref-inferred-from-referrer, studio-url-scheme#ac:ref-inference-fallback-head

Add `apps/app/src/app/core/routing/referer-ref-inference.ts` with an initial GitHub parser for `https://github.com/{owner}/{repo}/blob/{ref}/{path}`. On project-page bootstrap, when the route has no `?ref` query parameter AND `document.referrer` matches a registered parser AND the parser yields a non-empty ref, call `history.replaceState` to push the resolved `?ref` into the URL. When the referrer is absent, opaque, or unrecognized, do nothing — the route's existing default-branch behavior from Task 5 takes over. Add unit tests covering: (a) known-forge match → replaceState called with correct ref; (b) absent referrer → no replaceState, no `?ref`. GitLab, Bitbucket, and Codeberg parsers can ship as separate follow-ups; the registry is designed to accept additions without touching the consumer.

### Task 9: Cross-repo handoff for producer-side AC

**Verifies:** studio-url-scheme#ac:artifact-url-emits-without-ref

This AC is producer-side: the `specscore` CLI (in [`specscore/specscore-cli`](https://github.com/specscore/specscore-cli), with format/spec source of truth in the `specscore` repo) is the artifact author that must not emit `?ref=` into committed spec files. Studio-app cannot enforce it at runtime — Studio only observes the contract via ref-less URLs in committed artifacts. The task is satisfied when a sibling plan exists in the `specscore` repo that owns this AC end-to-end (a CLI URL-emitter Feature + Plan authored via `specstudio:specify` and `specstudio:plan` in that repo). This task can proceed in parallel with Tasks 1–8 and is the explicit tracking record of the cross-repo dependency.

### Task 10: Migrate canonical route to `/app/{git_host}/...` (D-0001 amendment)

**Verifies:** studio-url-scheme#ac:first-segment-dispatch-by-dot

Migrate the canonical URL scheme from the original `/app/project/{git_host}/{org}/{repo}/{path}` to the amended `/app/{git_host}/{org}/{repo}/{path}` per the D-0001 same-day amendment. The custom `canonicalPathMatcher` UrlMatcher relocates from a child of the `project` route to the top level of `apps/app/src/app/app.routes.ts`. The `urlSchemeGuard` adds the first-segment dispatch rule (REQ:first-segment-dispatch): segment contains `.` → forge canonical; segment starts with `~` → handle reservation (placeholder render); segment matches a registered app-route literal → that app page; otherwise 404. The forge-host allow-list and IDNA normalization carry forward unchanged but the allow-list adds an invariant assertion that every host contains `.` (REQ:host-allowlist amendment). The `/project/unsupported-source` literal route relocates to `/app/unsupported-source`. Existing path-validation, query-param extraction, and ref-inference logic is preserved. Existing tests rewrite for the new URL shape — every test fixture URL drops the `project/` segment.

### Task 11: Implement `#page=` view hash and fold ProjectSpecPage into ProjectPage

**Verifies:** studio-url-scheme#ac:page-hash-selects-view

Add `#page=` URL-fragment handling per REQ:page-view-hash. ProjectPage detects when the resolved `{path}` is a directory and reads `window.location.hash` for a `#page=features|plans|architecture|tests` selector; on match, it renders the matching tree view instead of the directory's README. ProjectSpecPage (which today handles `/project/features` etc. via the legacy `?id=` scheme) is folded into ProjectPage as one of these view modes — the literal `features`, `plans`, `architecture`, `tests` route entries in `project.routes.ts` are removed entirely. The Studio left-nav menu is rewired: clicking "Features" on a project URL appends `#page=features` to the current canonical URL via in-app navigation, preserving the project context (this fixes the original navigation-loss bug that motivated the D-0001 amendment). The `?op=` vs `#page=` disjointness from D-0001 Rule 7 is enforced — `#page=` accepts only the view set, `?op=` accepts only the verb set. Tests cover: (a) directory URL + `#page=features` renders the Features tree; (b) file URL + `#page=...` does NOT match the view selector (file URLs are out of `#page=` scope); (c) menu navigation from a canonical project URL preserves coordinates and appends the correct `#page=` value.

## Open Questions

- UX copy on `UnsupportedSourceComponent` is intentionally generic in Task 2; finalize wording before the v1 launch (Feature's existing Outstanding Question on this).
- GitLab/Bitbucket/Codeberg ref-inference parsers in Task 8: ship as follow-up tasks under this plan (revise-in-place) or under a v1.1 plan? Either is fine; resolve when v1 lands.
- Cloudflare zone-level Transform Rules could alternatively emit `Referrer-Policy` for the entire `specscore.studio` zone (Task 7) without Worker code. The Worker approach keeps the rule colocated with the app and easy to grep; the zone-level rule covers all subpaths (including the Astro marketing site) uniformly. Pick at implementation time.

---
*This document follows the https://specscore.md/plan-specification*
