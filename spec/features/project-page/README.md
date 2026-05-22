# Feature: Project Page

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=explore) | [Edit](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=edit) | [Ask question](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=ask) | [Request change](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/project-page?op=request-change) |

**Status:** Conceptual
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

- Path shape: `/app/project/{git_host}/{org}/{repo}/{path}`
- Handle shape: `/app/project/~{handle}/{project-slug}/{path}`

The URL-scheme route guard parses and validates the URL (allow-list, IDNA normalization, path-decoding once, traversal rejection). This feature consumes the parsed coordinates (`{git_host, org, repo, path, ref?, op?}`) and renders the README content area described below. When `{path}` is empty the route resolves to the project root, which is what this feature renders.

The legacy URL `/project?id={repo}@{org}@{git_host}` is redirected to the canonical path shape by the studio-url-scheme feature; this feature does not handle that redirect directly.

### Layout

The project page reuses the existing `AppLayout` with its sidebar. When the route starts with `/project`, the sidebar menu switches to project-specific items (see Sidebar section below). The main content area displays the README or a sub-page depending on the active route.

### Sidebar

The sidebar displays the following menu structure when inside a project context:

```
Specifications
  ├─ Features        → list view (URL encoding TBD — see Outstanding Questions)
  ├─ Plans           → list view (URL encoding TBD)
  ├─ Architecture    → list view (URL encoding TBD)
  ├─ Tests           → list view (URL encoding TBD)
Runners
  ├─ [+ Add]         → (stub action)
```

All sidebar links MUST preserve the parsed project coordinates (`{git_host}/{org}/{repo}` for the path shape, `~{handle}/{project-slug}` for the handle shape) so the project context is maintained across navigation.

The `AppMenu` component determines which menu model to display based on the active route. When the route matches the canonical `/app/project/…` routes defined in [studio-url-scheme](../studio-url-scheme/README.md), it shows the project menu; otherwise, it shows the default menu.

### README content area

The default `/project` route displays the root `README.md` from the project's main GitHub repository.

**Data source:** GitHub REST API `GET /repos/:owner/:repo/readme` with `Accept: application/vnd.github.raw+json`, using the user's linked GitHub OAuth token.

**Rendering:** Raw Markdown is rendered client-side to HTML using a Markdown library (e.g., `ngx-markdown` or `marked`).

**States:**

| State | Display |
|---|---|
| Authenticated, README loaded | Rendered Markdown content |
| Authenticated, loading | Loading spinner or skeleton |
| Authenticated, 404 (no README) | "This repository does not have a README.md" message |
| Authenticated, 403 (no access) | "You don't have access to this repository" message |
| Not authenticated / no GitHub token | "Sign in with GitHub to view project content" prompt |

No client-side caching for MVP — the README is fetched on each page visit.

### Stub pages

Sub-routes (`/project/features`, `/project/plans`) display a reusable "Coming soon" stub component. The stub shows the section title and a brief message: "This section is under development."

### Navigation from Home

Clicking a project entry in the home page's Projects card navigates to the canonical path URL for that project: `/app/project/{git_host}/{org}/{repo}` with an empty `{path}` segment (resolves to the project root).

### File structure

```
apps/app/src/app/
  pages/
    project/
      project.routes.ts          ← child routes for /project/*
      project-page.ts            ← main page component (README view)
      project-stub.ts            ← reusable "Coming soon" component
  core/
    services/
      github.service.ts          ← GitHub API calls (fetch README)
```

## Dependencies

- authentication
- studio-url-scheme

## Acceptance Criteria

### AC: authenticated-readme-rendered

Scenario: an authenticated user lands on a project page and sees the rendered README
**Given** the user is signed in with a linked GitHub identity that can read the target repository
**When** the user navigates to `/app/project/github.com/owner/repo`
**Then** the page fetches the repository README via the GitHub API and renders it as HTML in the main content area

### AC: unauthenticated-prompts-signin

Scenario: an unauthenticated visitor is prompted to sign in
**Given** the user is not signed in (or has no linked GitHub identity)
**When** the user navigates to `/app/project/github.com/owner/repo`
**Then** the main content area renders the "Sign in with GitHub to view project content" prompt instead of attempting a GitHub API call

### AC: sidebar-shows-project-menu

Scenario: the sidebar switches to project-context menu items
**Given** the user is on a canonical `/app/project/…` route
**When** the AppMenu component selects its menu model
**Then** the sidebar renders the project menu items (Specifications > Features, Plans, Architecture, Tests; Runners) instead of the default menu

### AC: sidebar-preserves-coordinates

Scenario: sidebar links carry the project context across navigation
**Given** the user is on a project page with parsed coordinates (path shape `{git_host}/{org}/{repo}` or handle shape `~{handle}/{project-slug}`)
**When** the user clicks any sidebar link
**Then** the destination URL preserves those parsed coordinates and remains within the same project context

### AC: stub-pages-coming-soon

Scenario: a not-yet-implemented sub-section renders a placeholder
**Given** the user is on a project page
**When** the user clicks a stub menu item (Features, Plans, Architecture, or Tests)
**Then** the destination route renders a reusable "Coming soon" component with the section title and a brief message

### AC: home-card-navigates-to-canonical

Scenario: clicking a project on the home page navigates to its canonical URL
**Given** the user is on the home page and at least one project entry is visible in the Projects card
**When** the user clicks a project entry
**Then** the router navigates to `/app/project/{git_host}/{org}/{repo}` with an empty `{path}` segment

## Open Questions

- Which Markdown rendering library should be used — `ngx-markdown`, `marked`, or another option?
- Should relative links and images in the README resolve against the GitHub repository (so images render correctly), or is raw text sufficient for MVP?
- Should the sidebar show a dynamic list of runners (from an API) in future iterations, or remain static?
- How should the page handle a `{path}` that points at a non-existent or inaccessible file under the resolved repo coordinates? (Studio-url-scheme handles host/path validation; this is the in-repo case.)
- Sub-route URL encoding for list views (Features, Plans, Architecture, Tests): the path shape's `{path}` segment is reserved for in-repo artifact paths, so a Studio-level list view cannot reuse path positions. Options to decide before implementing the stubs: a Studio-level operation parameter (`?op=features-list`), a dedicated path prefix (`/app/list/{kind}/{host}/{org}/{repo}`), or a separate top-level route. Resolve in a follow-up plan.

---
*This document follows the https://specscore.md/feature-specification*
