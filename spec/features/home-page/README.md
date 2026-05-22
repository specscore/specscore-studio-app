# Feature: Home Page

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/home-page?op=explore) | [Edit](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/home-page?op=edit) | [Ask question](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/home-page?op=ask) | [Request change](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/home-page?op=request-change) |

**Status:** Conceptual

## Summary

The home page is the default view for unauthenticated visitors to SpecScore App. It presents a responsive card grid that serves both discovery (understanding what SpecScore offers) and onboarding (getting started). Six cards give equal-weight paths into the product: GitHub sign-in, project exploration, cloud VM trial, GitHub App installation, local quickstart, and community activity.

## Problem

Unauthenticated visitors arrive from the landing page (specscore.io) or the GitHub repository. They already have a general idea of what SpecScore is but need clear, low-friction paths to either try it or explore it. Without a purposeful home page, they land on a blank shell that requires sign-in before they can see any value.

## Behavior

### Layout

Page uses the shared header (topbar) but no sidebar menu. Content is a responsive card grid with no hero section:

- **Desktop:** 3 columns
- **Tablet:** 2 columns
- **Mobile:** 1 column

All cards are equal height within a row. Card order is fixed.

### Cards

#### 1. Sign in with GitHub

OAuth sign-in via GitHub. Slightly emphasized with an accent border to stand out from the other cards without dominating the page. Shows brief copy about what signing in unlocks (access projects, claim tasks, manage workspace). Contains a "Continue with GitHub" CTA button.

#### 2. Projects

Two-section card visible in both authenticated and unauthenticated states:

- **My Projects** — header with an "+ Add" button.
  - **Unsigned:** shows a "[Sign in] to see your personal projects" prompt.
  - **Signed in, no projects:** shows text stating no projects have been added yet.
  - **Signed in, has projects:** lists the user's projects.
- **Demo Projects** — curated list of public SpecScore projects anyone can browse read-only. Hardcoded as a TypeScript array for now.
  - SpecScore
  - ToDo App

#### 3. Free Cloud VM

Promotes the hosted environment for trying SpecScore without local setup. Describes what's included (CLI, agents, pre-configured workspace). The VM is not yet available — clicking the CTA shows a "not available yet" message and tracks the click for demand measurement.

#### 4. SpecScore GitHub App

Promotes installing the GitHub App for repo sync, automated task creation, and status checks. Links to the GitHub Marketplace listing. Works for both signed-in and unsigned visitors (GitHub handles the install flow externally).

#### 5. Getting Started

Three-step quickstart:

1. Install the CLI
2. Init your project
3. Run your first task

Each step is a brief label, not a full tutorial. Links to the documentation site for details.

#### 6. Community Pulse

Live stats from public SpecScore projects:

- Active projects in last 24 hours
- Active users in last 24 hours

Data refreshes on page load (not real-time). Shows placeholder/skeleton state while loading.

### General behavior

- No authentication required to view the page.
- If a signed-in user navigates to `/`, they see the same page but with the Projects card reflecting their personal projects. Other cards remain visible.
- Cards are non-interactive beyond their individual CTAs — no drag, reorder, or dismiss.

## Dependencies

- authentication

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | Signed-in user sees their personal projects in the Projects card, or text stating no projects have been added yet. |
| AC-2 | Unauthenticated user sees a sign-in prompt in the My Projects section of the Projects card. |
| AC-3 | Clicking the Free Cloud VM CTA shows a "not available yet" message and records a tracking event. |

## Open Questions

- Acceptance criteria for the remaining cards (Sign in, GitHub App, Getting Started, Community Pulse) and layout breakpoints are not yet defined.

---
*This document follows the https://specscore.md/feature-specification*
