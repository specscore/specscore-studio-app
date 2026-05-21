# Feature: Project Page

**Status:** Conceptual

## Summary

The project page is the main view for a SpecScore project in the Hub. It displays the root README.md from the project's main GitHub repository and provides sidebar navigation to project-specific sections such as specifications (Features, Plans) and Runners.

## Problem

Users who click on a project from the home page have no destination — there is no page that shows what a project is about or provides navigation into its contents. The project's GitHub README is the natural starting point: it describes the project's purpose, setup, and conventions. Without a project page, users must leave the Hub and browse the GitHub repository directly.

## Behavior

### Route

The project page lives at `/project` with a query parameter `id` containing the full GitHub URL:

```
/project?id=github.com/specscore/specscore
```

The `id` value is parsed to extract `owner` and `repo` for GitHub API calls.

### Layout

The project page reuses the existing `AppLayout` with its sidebar. When the route starts with `/project`, the sidebar menu switches to project-specific items (see Sidebar section below). The main content area displays the README or a sub-page depending on the active route.

### Sidebar

The sidebar displays the following menu structure when inside a project context:

```
Specifications
  ├─ Features        → /project/features?id=...
  ├─ Plans           → /project/plans?id=...
  ├─ Architecture    → /project/architecture?id=...
  ├─ Tests           → /project/tests?id=...
Runners
  ├─ [+ Add]         → (stub action)
```

All sidebar links preserve the `?id=...` query parameter so the project context is maintained across navigation.

The `AppMenu` component determines which menu model to display based on the active route. When the route starts with `/project`, it shows the project menu; otherwise, it shows the default menu.

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

Clicking a project entry in the home page's Projects card navigates to `/project?id=github.com/:owner/:repo`.

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

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | Navigating to `/project?id=github.com/owner/repo` while authenticated with GitHub displays the rendered README.md from that repository. |
| AC-2 | Navigating to `/project?id=github.com/owner/repo` while not authenticated shows a "Sign in with GitHub to view project content" prompt. |
| AC-3 | The sidebar displays project-specific menu items (Specifications > Features, Plans; Runners) when on a `/project` route. |
| AC-4 | All sidebar links preserve the `?id=...` query parameter. |
| AC-5 | Clicking a stub menu item (Features, Plans) navigates to a "Coming soon" page. |
| AC-6 | Clicking a project in the home page Projects card navigates to `/project?id=github.com/owner/repo`. |

## Outstanding Questions

- Which Markdown rendering library should be used — `ngx-markdown`, `marked`, or another option?
- Should relative links and images in the README resolve against the GitHub repository (so images render correctly), or is raw text sufficient for MVP?
- Should the sidebar show a dynamic list of runners (from an API) in future iterations, or remain static?
- How should the page handle malformed or missing `id` query parameters — redirect to home, or show an error?
