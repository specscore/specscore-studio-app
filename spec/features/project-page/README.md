# Feature: Project Page

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=explore) | [Edit](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=edit) | [Ask question](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=ask) | [Request change](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=request-change) |

**Status:** Approved
**Date:** 2026-05-22
**Owner:** alexander.trakhimenok@gmail.com
**Source Ideas:** —
**Supersedes:** —

## Summary

The project page is the main view for a SpecScore project in the Hub. It displays the root README.md from the project's main GitHub repository and provides sidebar navigation to project-specific sections such as specifications (Features, Plans) and Runners.

## Problem

Users who click on a project from the home page have no destination — there is no page that shows what a project is about or provides navigation into its contents. The project's GitHub README is the natural starting point: it describes the project's purpose, setup, and conventions. Without a project page, users must leave the Hub and browse the GitHub repository directly.

## Behavior

### Route

The project page is served by the canonical routes defined in the [studio-url-scheme](../studio-url-scheme/README.md) feature. Both shapes resolve here:

- Path shape: `/app/{git_host}/{org}/{repo}[/{path}]`
- Handle shape: `/app/~{handle}[/{path}]` (reserved; renders a placeholder per the studio-url-scheme Feature)

The URL-scheme route guard parses and validates the URL (allow-list, IDNA normalization, path-decoding once, traversal rejection). This feature consumes the parsed coordinates (`{git_host, org, repo, path, ref?, op?}`) and renders content per the README content area section below. When `{path}` is empty the route resolves to the project root.

The pre-canonical `?id=` and intermediate `/app/project/...` URL forms are dropped without a redirect bridge per the studio-url-scheme Feature.

### Layout

The project page reuses the existing `AppLayout` with its sidebar. The sidebar's `AppMenu` component switches to the project-specific menu when the URL's first segment (after `/app/`) contains `.` or starts with `~` (per the studio-url-scheme dispatch rule); otherwise it shows the default app menu.

### Sidebar

The sidebar displays the following menu structure when inside a project context:

```
Project
  └─ Overview        → /app/{git_host}/{org}/{repo}
Specifications
  ├─ Architecture    → /app/{git_host}/{org}/{repo}/spec/architecture#page=architecture
  ├─ Features        → /app/{git_host}/{org}/{repo}/spec/features#page=features
  │   ├─ <feature-dir>      → /app/{git_host}/{org}/{repo}/spec/features/<feature-dir>#page=features
  │   │   └─ <sub-dir>      → /app/{git_host}/{org}/{repo}/spec/features/<feature-dir>/<sub-dir>#page=features
  │   └─ …
  ├─ Plans           → /app/{git_host}/{org}/{repo}/spec/plans#page=plans
  │   └─ <plan-dir>  → /app/{git_host}/{org}/{repo}/spec/plans/<plan-dir>#page=plans
  └─ Tests           → /app/{git_host}/{org}/{repo}/spec/tests#page=tests
```

Spec sub-trees (Features, Plans, Architecture, Tests) populate on-demand via the GitHub Contents API. Sibling and descendant directories appear as expandable nodes as their content loads.

#### REQ: menu-canonical-link-shape

All project-menu links MUST be canonical URLs per [studio-url-scheme](../studio-url-scheme/README.md): `/app/{git_host}/{org}/{repo}/{path}` for content navigation, with the `#page={view}` fragment indicating which spec category the destination belongs to. The fragment values are drawn from the view set (`features`, `plans`, `architecture`, `tests`) and are disjoint from `?op=` values per [D-0001 Rule 7](https://specscore.studio/app/github.com/specscore/specscore/spec/decisions/0001-studio-url-scheme.md).

#### REQ: menu-preserves-project-context

Every project-menu link MUST carry the current project's `{git_host}/{org}/{repo}` coordinates. The menu MUST NOT emit any link that drops project context (e.g. a bare `/spec/features` URL).

#### REQ: menu-lazy-child-load

Sidebar spec sub-trees MUST load their child directories on-demand via the GitHub Contents API. The menu MUST NOT pre-fetch the full repository tree at project load. Already-loaded directories MUST be cached in memory keyed by the directory's repository path; subsequent loads of the same directory MUST short-circuit on cache hit.

#### REQ: menu-deep-link-auto-expansion

When the user lands directly on a sub-directory URL (e.g. `/app/{git_host}/{org}/{repo}/spec/features/<feature-dir>`), the menu MUST automatically fetch the directory tree for every prefix on the URL's `{path}` so the corresponding nodes are visible and the active leaf is selected without requiring the user to manually click parent nodes. The fetches MUST run idempotently (cache hits short-circuit) and asynchronously (no blocking on initial render).

#### REQ: menu-cache-scoped-to-project

The menu's directory-content cache MUST be keyed by `{git_host}/{org}/{repo}` and MUST be cleared when the user navigates to a different project. This prevents one project's directory listings from being displayed against another project's coordinates.

#### REQ: menu-text-click-navigates-and-expands

Clicking the text or icon of a menu node MUST navigate to that node's URL AND, when the node has children, ensure its sub-tree is expanded. Text click MUST NOT collapse an already-expanded node — collapse is reserved for the chevron control (REQ:menu-chevron-toggles). This prevents users from accidentally hiding the content they just selected.

#### REQ: menu-chevron-toggles

A node with children MUST render a chevron control distinct from the node's text. Clicking the chevron MUST toggle expand/collapse without navigating. The chevron MUST stop click propagation so the surrounding text-click handler (REQ:menu-text-click-navigates-and-expands) does NOT also fire. The chevron MUST expose `aria-expanded` and an `aria-label` reflecting the current state for screen reader users.

#### REQ: menu-active-node-highlighted

The menu node whose URL matches the current route MUST receive visual highlighting (via `routerLinkActive` or equivalent) so the user can see where they are in the tree.

### Content area

The content area renders one of three things, chosen by the parsed `{path}` from the URL:

| `{path}` shape | Rendered content | GitHub endpoint |
|---|---|---|
| Empty | The repository's default README | `GET /repos/:owner/:repo/readme` |
| Last segment contains a `.` (treated as a file, e.g. `spec/features/login.md`) | The file's rendered content | `GET /repos/:owner/:repo/contents/{path}` |
| Last segment has no `.` (treated as a directory, e.g. `spec/features/cli`) | The directory's `README.md` | `GET /repos/:owner/:repo/contents/{path}/README.md` |

The file-vs-directory choice is a heuristic on the final segment's extension — there is no upfront API call to inspect the path's type.

#### REQ: content-fetch-uses-server-rendered-html

The page MUST request HTML directly from GitHub (`Accept: application/vnd.github.html+json`) rather than fetching raw Markdown and rendering it client-side. This delegates the Markdown dialect, syntax-highlighting, and emoji rendering to GitHub's renderer — matching what users see on GitHub.com — and keeps a Markdown parser out of the SPA bundle. The returned HTML is bound via `[innerHTML]` and the response stream is treated as trusted (GitHub renders the file's source under its own sanitization rules).

#### REQ: content-fetch-respects-ref

Fetches MUST append `?ref={ref}` when the URL carries a `?ref` query parameter (REQ:ref-query-param in studio-url-scheme). Absent `?ref`, GitHub resolves against the default branch.

#### REQ: content-relative-image-rewriting

Relative `<img src="...">` attributes in the returned HTML MUST be rewritten to absolute `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/...` URLs so images authored against the repository render in the SPA. Absolute `http(s)://` image URLs MUST pass through unchanged.

#### REQ: content-client-cache

Fetched content MUST be cached client-side keyed by `(owner, repo, path, ref)` with a 10-minute TTL. Subsequent identical requests within the TTL window MUST serve from cache without a network call. A manual refresh action MUST bypass the cache (`skipCache=true`).

#### REQ: content-states

The content area MUST render one of the following observable states based on auth and fetch outcome:

| State | Trigger | Display |
|---|---|---|
| `not_authenticated` | User is not signed in OR has no linked GitHub identity | "Sign in with GitHub to view project content" prompt with sign-in button |
| `loading` | Fetch in flight | Spinner (PrimeNG `pi-spinner` animated) |
| `loaded` | Fetch succeeded | Rendered HTML in a `.markdown-body` container with a refresh button in the header showing the addressed `{path}` (or `README` for the bare-repo case) |
| `no_readme` | Fetch returned HTTP 404 against a directory-style path's `{path}/README.md` | "No README.md found at this location." with the requested path |
| `error` | Fetch failed for any other reason (403, network, JSON parse, etc.) | Plain-language error message — e.g. "You don't have access to this repository" for 403, "Failed to load README." for other failures. Raw exception details stay in `console.error`. |
| `handle_unresolved` | URL is the handle-shape `/app/~{handle}[/{path}]` (resolver deferred per studio-url-scheme REQ:handle-canonical-route) | Neutral "Handle resolution is coming soon" placeholder; no error chrome per studio-url-scheme AC:handle-canonical-parses |

The states MUST follow the workspace's "no silent failures" rule (CLAUDE.md): every fetch failure produces a user-visible state, not a stuck spinner or console-only log.

### Navigation from Home

Clicking a project entry in the home page's Projects card navigates to the canonical path URL for that project: `/app/{git_host}/{org}/{repo}` with an empty `{path}` segment (resolves to the project root).

### File structure

```
apps/app/src/app/
  app.routes.ts                   ← top-level canonical + handle matchers per studio-url-scheme
  pages/
    project/
      project-page.ts             ← main page component (renders README OR file OR directory README)
      unsupported-source.ts       ← REQ:unknown-host-rejection target
  layout/
    component/
      app.menu.ts                 ← project menu builder, lazy child loading
      app.menuitem.ts             ← shared menu item with text/chevron click split
  core/
    services/
      github.service.ts           ← GitHub API: fetchReadmeHtml / fetchFileHtml / fetchDirectoryContents
    routing/
      url-scheme.guard.ts         ← URL parsing + dispatch (REQ:first-segment-dispatch)
      forge-host.allowlist.ts     ← allow-list + IDNA normalization
      referer-ref-inference.ts    ← optional Referer-based ref inference
```

ProjectSpecPage's responsibilities (rendering directory READMEs) were folded into ProjectPage with the D-0001 URL-scheme amendment; the standalone `project-stub.ts` / `project-spec-page.ts` / `project.routes.ts` files were removed.

## Dependencies

- authentication
- studio-url-scheme

## Acceptance Criteria

### AC: authenticated-readme-rendered (verifies REQ:content-fetch-uses-server-rendered-html, REQ:content-states)

Scenario: an authenticated user lands on a project page and sees the rendered README
**Given** the user is signed in with a linked GitHub identity that can read the target repository
**When** the user navigates to `/app/github.com/owner/repo`
**Then** the page issues a GitHub API request to `https://api.github.com/repos/owner/repo/readme` with `Accept: application/vnd.github.html+json`, and the returned HTML renders in the main content area (state = `loaded`)

### AC: directory-renders-its-readme (verifies REQ:content-fetch-uses-server-rendered-html, REQ:content-states)

Scenario: a directory URL renders the directory's README.md
**Given** the user is on `/app/github.com/owner/repo/spec/features` and `spec/features/README.md` exists in the repository
**When** the page bootstraps
**Then** the page issues a GitHub API request to `https://api.github.com/repos/owner/repo/contents/spec/features/README.md` and renders the returned HTML (state = `loaded`). A directory whose README is absent renders state = `no_readme` with the directory path shown in the empty-state message.

### AC: file-url-renders-file-content (verifies REQ:content-fetch-uses-server-rendered-html)

Scenario: a file URL renders the file's HTML directly
**Given** the user is on `/app/github.com/owner/repo/spec/features/login.md`
**When** the page bootstraps
**Then** the page issues a GitHub API request to `https://api.github.com/repos/owner/repo/contents/spec/features/login.md` (NOT `/login.md/README.md`) and renders the returned HTML

### AC: ref-pinned-fetch (verifies REQ:content-fetch-respects-ref)

Scenario: a `?ref` query param pins the fetch to that ref
**Given** the user is on `/app/github.com/owner/repo?ref=feature/x`
**When** the page bootstraps
**Then** the GitHub API request includes `?ref=feature%2Fx` in its query string, and the returned content is the README at that ref

### AC: relative-images-rewritten (verifies REQ:content-relative-image-rewriting)

Scenario: relative image URLs in the README are rewritten to absolute URLs
**Given** a repository README contains `<img src="docs/screenshot.png">`
**When** the page renders that README's HTML
**Then** the rendered `<img>` element's `src` attribute is `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/docs/screenshot.png` (absolute), while `<img src="https://example.com/foo.png">` (already absolute) is unchanged

### AC: content-cached-within-ttl (verifies REQ:content-client-cache)

Scenario: a repeat visit within the cache TTL serves from memory
**Given** the page just fetched the README for `(owner, repo, path, ref)` and cached the response
**When** the user navigates away and returns to the same URL within 10 minutes
**Then** no network request is issued — the cached HTML renders immediately. Clicking the in-card refresh button bypasses the cache and issues a fresh request.

### AC: unauthenticated-prompts-signin (verifies REQ:content-states)

Scenario: an unauthenticated visitor is prompted to sign in
**Given** the user is not signed in (or has no linked GitHub identity)
**When** the user navigates to `/app/github.com/owner/repo`
**Then** the main content area renders the "Sign in with GitHub to view project content" prompt (state = `not_authenticated`) instead of attempting a GitHub API call

### AC: sidebar-shows-project-menu (verifies REQ:menu-canonical-link-shape)

Scenario: the sidebar switches to project-context menu items
**Given** the user is on a canonical project route (e.g. `/app/github.com/specscore/specscore-cli`)
**When** the AppMenu component selects its menu model
**Then** the sidebar renders the project menu items (Project > Overview; Specifications > Architecture, Features, Plans, Tests) instead of the default app menu

### AC: sidebar-preserves-coordinates (verifies REQ:menu-preserves-project-context)

Scenario: sidebar links carry the project context across navigation
**Given** the user is on a project page with parsed coordinates `{git_host}/{org}/{repo}`
**When** the user inspects any sidebar link's URL
**Then** that URL starts with `/{git_host}/{org}/{repo}` (the project root) — no link in the project menu drops project context

### AC: menu-lazy-loads-spec-children (verifies REQ:menu-lazy-child-load)

Scenario: spec sub-trees fetch their children only when needed
**Given** the user is on a project page and the Features tree has not been expanded
**When** the page first renders
**Then** no GitHub Contents API request is issued for `spec/features/` — the request is deferred until the Features node is interacted with OR the URL points inside `spec/features/...` (REQ:menu-deep-link-auto-expansion)

### AC: menu-deep-link-expands-sub-tree (verifies REQ:menu-deep-link-auto-expansion)

Scenario: landing on a deep URL auto-expands the spec tree to the leaf
**Given** the menu's cache is empty (e.g. fresh page load)
**When** the user navigates directly to `/app/{git_host}/{org}/{repo}/spec/features/<feature-dir>`
**Then** the menu fetches every directory prefix on the URL's `{path}` (`spec/features`, `spec/features/<feature-dir>`) and the Features group renders expanded with `<feature-dir>` visible inside it; `<feature-dir>` is highlighted as the active node

### AC: menu-text-click-expands-without-collapsing (verifies REQ:menu-text-click-navigates-and-expands)

Scenario: clicking the text of an expanded parent does NOT collapse it
**Given** the user has expanded the Features sub-tree (e.g. by clicking its chevron)
**When** the user clicks the text "Features"
**Then** the router navigates to `/app/{git_host}/{org}/{repo}/spec/features#page=features` AND the Features sub-tree remains expanded (it does NOT collapse)

### AC: menu-chevron-toggles-without-navigating (verifies REQ:menu-chevron-toggles)

Scenario: chevron toggles expansion without changing the route
**Given** the user is on a project page and the Features sub-tree is expanded
**When** the user clicks the chevron control next to "Features"
**Then** the Features sub-tree collapses AND the URL does not change (no router navigation occurs)

### AC: menu-cache-clears-on-project-change (verifies REQ:menu-cache-scoped-to-project)

Scenario: switching projects clears the previous project's menu cache
**Given** the user is on `/app/{git_host_A}/{org_A}/{repo_A}` with the Features tree expanded and cached
**When** the user navigates to `/app/{git_host_B}/{org_B}/{repo_B}` (a different project)
**Then** the menu rebuilds from scratch for the new project — the previous project's cached directory listings are NOT shown against the new project's coordinates

### AC: home-card-navigates-to-canonical

Scenario: clicking a project on the home page navigates to its canonical URL
**Given** the user is on the home page and at least one project entry is visible in the Projects card
**When** the user clicks a project entry
**Then** the router navigates to `/app/{git_host}/{org}/{repo}` with an empty `{path}` segment

## Open Questions

- Should the sidebar show a dynamic list of runners (from an API) in future iterations, or remain static? (Runners were proposed in the original draft but not implemented; they remain Out of Scope until a Feature defines what a Runner is.)
- The current "no_readme" rendering when a directory has no `README.md` shows a static placeholder. A directory listing (folder contents instead of "no README") might be more useful UX — track as a separate Feature if pursued.
- Menu cache invalidation on branch change: when the user changes `?ref=` to a different branch, the directory tree from the previous branch is cached and re-used. Acceptable today (most projects' directory structure doesn't churn per-branch), but the `?ref=` change ought to invalidate the menu cache eventually.

---
*This document follows the https://specscore.md/feature-specification*
