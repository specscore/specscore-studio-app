# Feature: Studio URL Scheme

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/p/github.com/specscore/specscore-studio-app/spec/features/studio-url-scheme?op=explore) | [Edit](https://specscore.studio/app/p/github.com/specscore/specscore-studio-app/spec/features/studio-url-scheme?op=edit) | [Ask question](https://specscore.studio/app/p/github.com/specscore/specscore-studio-app/spec/features/studio-url-scheme?op=ask) | [Request change](https://specscore.studio/app/p/github.com/specscore/specscore-studio-app/spec/features/studio-url-scheme?op=request-change) |

**Status:** Approved
**Date:** 2026-05-22
**Owner:** alexander.trakhimenok@gmail.com
**Source Ideas:** —
**Supersedes:** —

## Summary

The Studio URL Scheme defines the canonical deep-link URLs that point from SpecScore artifacts (in any consumer repo) into SpecScore Studio. It owns the route shapes, query-parameter contract, legacy redirects, and the security gates around untrusted URL inputs. Downstream features (project page, future spec viewers) consume these routes but do not redefine them.

## Problem

SpecScore artifacts are committed to consumer repositories and reference Studio via long-lived URLs. Today there is contractual drift: the `specscore` repo's documentation and CLI emit a path-style URL while the Studio web app implements a different query-parameter URL with reverse-order, `@`-separated identifiers. Neither side honors the `~handle` shape, the ref-as-query-parameter contract, or the forge-host allow-list that the cross-project [Studio URL Scheme decision (D-0001)](https://specscore.studio/app/project/github.com/specscore/specscore/spec/decisions/0001-studio-url-scheme.md) ratified.

Without a single feature owning the URL contract on the Studio side:

- Routes are defined ad hoc inside individual page features (e.g. `project-page` currently declares its own URL shape that conflicts with the decision).
- Security controls (host allow-list, path validation, `Referrer-Policy`) have no home and risk being implemented inconsistently per-page or skipped entirely.

This feature consolidates those concerns so consumers and reviewers have one place to read the contract and one place to enforce it. The pre-canonical `?id=` URL form is dropped without an edge-level migration bridge; existing links must be updated by their authors to the canonical form.

## Behavior

### Canonical routes

Studio exposes two route shapes that resolve to the same project surface. Both shapes are first-class — neither redirects to the other.

#### REQ: path-canonical-route

Studio MUST resolve URLs of the form `/app/project/{git_host}/{org}/{repo}/{path}` to the project page for the addressed artifact. Path segments are positional: segment 1 is `{git_host}`, segment 2 is `{org}`, segment 3 is `{repo}`, segments 4 and onward (joined by `/`) are `{path}`. The trailing `{path}` MAY be empty, in which case the route resolves to the project root.

#### REQ: handle-canonical-route

Studio MUST resolve URLs of the form `/app/project/~{handle}/{project-slug}/{path}` to the project page identified by the `{handle}` namespace and `{project-slug}`. The leading `~` is mandatory and signals a handle namespace. Handle resolution to the underlying forge repository is out of scope for this feature; this requirement only reserves the route shape and parses the segments.

#### REQ: app-prefix-required

Both canonical routes MUST live under the `/app/` path prefix. The prefix is required so the Progressive Web App service worker registered for `/app/sw.js` claims only the application surface and not the apex marketing site.

### Query parameters

#### REQ: ref-query-param

Studio MUST treat `?ref={branch|tag|sha}` as the contractual mechanism for pinning a specific git reference. The value MAY contain `/` (e.g. `?ref=feature/x`) and MUST be URL-decoded once before use. When `?ref` is absent, Studio resolves the artifact at the default branch of the underlying repository.

#### REQ: op-query-param

Studio MUST reserve `?op={operation}` for Studio operations on the addressed artifact (initial set: `explore`, `edit`, `ask`, `request-change`). The set is extensible. `?op` is orthogonal to `?ref`; both MAY appear in the same URL.

#### REQ: artifact-urls-omit-ref-by-default

URLs emitted into committed artifact bodies (by the `specscore` CLI, by AI agents, by humans editing spec files) MUST NOT include `?ref=`. This rule lives in the URL contract because the consequence is observable on the Studio side: a URL captured in a spec file on the `main` branch must still resolve correctly when the same file is read on a feature branch.

### Ref inference from Referrer

#### REQ: ref-inference-client-side

When a request arrives at a canonical route without a `?ref` query parameter AND `document.referrer` resolves to a recognized forge URL whose path encodes a parseable ref (e.g. GitHub `/blob/{ref}/`, GitLab `/-/blob/{ref}/`), Studio MUST infer the ref and replace the URL via `history.replaceState` to include the inferred `?ref`. The inference MUST run client-side only — never as a server-side redirect — so the CDN cache key remains `(URL, query)` without a `Vary: Referer` dependency. When the referrer is absent, opaque (`about:`, `chrome-extension:`, etc.), or from an unrecognized origin, Studio MUST fall back to the default-branch behavior from [REQ: ref-query-param](#req-ref-query-param). The set of recognized forge parsers is extensible; adding a parser is a code change inside the application.

### Forge host allow-list

#### REQ: host-allowlist

Studio MUST treat `{git_host}` as untrusted input. Only hosts on a maintained allow-list (initial set: `github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`) resolve to the normal project page. The allow-list lives in the application source — not in route configuration — so additions require code review.

#### REQ: host-idna-normalization

Before allow-list comparison, Studio MUST IDNA-normalize the host segment (NFC + lowercase + punycode resolution). This defeats homoglyph spoofing such as `gіthub.com` containing a Cyrillic `і` (U+0456).

#### REQ: unknown-host-rejection

Hosts that fail the allow-list MUST render a dedicated `Unsupported source` page. Studio MUST NOT render the normal project chrome (sidebar, breadcrumbs, README content) for an unknown host — doing so would create a phishing surface that piggybacks on the `specscore.studio` domain.

#### REQ: no-host-templating-in-fetch

Studio MUST NOT template `{git_host}` into any outbound fetch URL. The allow-listed host maps to a hardcoded forge API base URL inside the application. This blocks the SSRF class of attack in which an attacker-crafted `{git_host}` redirects Studio to an internal address (`localhost`, cloud metadata endpoints).

### Path validation

#### REQ: path-decoding-once

Studio MUST percent-decode `{path}` exactly once before any downstream use (rendering, fetching, logging). Re-decoding is prohibited. Centralize decoding inside a single route guard so downstream consumers never re-decode.

#### REQ: path-traversal-rejection

After decoding, Studio MUST reject paths that contain any of the following segments or sequences: `..`, `.` as a complete segment, `%00` (null byte), control characters (U+0000 through U+001F and U+007F), or an encoded forward slash (`%2F`). A rejected path renders the unsupported-source page.

### Response headers

#### REQ: referrer-policy-strict-origin

The Studio origin MUST emit `Referrer-Policy: strict-origin` for all responses. This prevents private `{org}` / `{repo}` / `{path}` segments from leaking via the `Referer` header when a user navigates from Studio to a third-party link. The header applies to the entire `specscore.studio` origin, not only the `/app/project/*` routes.

### Handle namespace constraints

#### REQ: handle-no-dots

The route parser MUST reject any `~{handle}` segment that contains a `.` character — such requests render the `unsupported-source` page from [REQ: unknown-host-rejection](#req-unknown-host-rejection). This guarantees that a handle segment can never collide with a `{git_host}` segment (which always contains at least one `.`). Handle registration policy MUST enforce the same constraint at registration time so route parsing and registration agree, but registration is out of scope for this feature.

## Architecture

```
apps/app/src/app/
  pages/
    project/
      project.routes.ts           ← path + handle routes under /app/project/
      project-page.ts             ← consumes parsed coordinates; see project-page feature
      unsupported-source.ts       ← dedicated component for REQ: unknown-host-rejection
  core/
    routing/
      url-scheme.guard.ts         ← decodes path once, validates per REQ: path-*
      forge-host.allowlist.ts     ← canonical allow-list + IDNA normalization
      referer-ref-inference.ts    ← optional client-side ref inference
worker/index.js                 ← appends Referrer-Policy header per REQ: referrer-policy-strict-origin
```

The `url-scheme.guard.ts` route guard runs before component activation and is the single funnel through which all parsed coordinates flow. Page-level features (e.g. `project-page`) consume the guard's parsed output and MUST NOT redo decoding, allow-list checks, or path validation.

## Data flow

1. Browser requests `/app/project/{git_host}/{org}/{repo}/{path}?ref=…`.
2. SPA fallback is provided by the Cloudflare Worker (`worker/index.js`): on a 404 from the static-asset binding, the Worker returns `/index.html`. The Angular router then takes over.
3. Angular router matches the route. The URL-scheme guard runs:
   a. Decode `{path}` once.
   b. Reject the path on traversal / control-char / encoded-slash matches.
   c. IDNA-normalize `{git_host}`; reject if outside allow-list → `unsupported-source` component.
   d. Map allow-listed host to a hardcoded forge API base.
4. The page component receives parsed `{git_host, org, repo, path, ref?, op?}` and proceeds with the rendering behavior defined in its own feature.
5. On the project page, if `?ref` was absent, the client-side ref-inference step inspects `document.referrer`. On match, it pushes the resolved `?ref` via `history.replaceState`.

## Error handling and failure modes

| Failure | Surface |
|---|---|
| Host not on allow-list | `unsupported-source` component (REQ: unknown-host-rejection) |
| IDNA-normalized host still not on allow-list (homoglyph attempt) | Same as above |
| Path traversal / control char / encoded slash | Same as above |
| Default branch resolution fails (e.g. repo not found) | Inline error in the project page per the workspace error-handling rule in `CLAUDE.md` (no silent failures) |
| Ref inference parser fails on a recognized forge | Fall back to default-branch resolution silently — inference is best-effort |

## Testing strategy

Per the SpecStudio Rehearse heuristic, every AC in this feature is testable via Angular router unit tests, route-guard unit tests, or Playwright/Cypress end-to-end tests. Rehearse stubs are NOT scaffolded in this initial revision; instead, the testing surface is recorded in [`## Rehearse Integration`](#rehearse-integration) so a follow-up plan can scaffold stubs once the implementation slice is sized. This trade keeps the feature artifact reviewable today without committing to a stub layout before the implementation surface is real.

## Rehearse Integration

All ACs are testable. Recommended test surfaces:

- **Route parsing & guard logic** — Jest unit tests against `url-scheme.guard.ts` and `forge-host.allowlist.ts`. Cover allow-list, IDNA normalization, path validation, decoding-once contract.
- **Ref query param** — Playwright end-to-end against a fixture project, varying `?ref`.
- **Ref inference** — Jest unit test against `referer-ref-inference.ts` with synthesized `document.referrer` values; deferred E2E coverage because the ADR marks this v1.1.
- **Unsupported source** — Playwright check that `/app/project/evil.example/foo/bar` renders the unsupported-source component, not project chrome.
- **Referrer-Policy header** — HTTP-level assertion against the Cloudflare Worker's response headers (deployed preview), confirming `Referrer-Policy: strict-origin` on `/app`, `/app/project/...`, and a static asset response.

Rehearse stubs MUST be scaffolded in the plan that implements this feature, one stub per AC. Skip-reasons are not expected for any AC.

## Not Doing / Out of Scope

- Handle registration UX, ownership verification (`.well-known/specscore-handle.txt` or OAuth-based), billing integration, and subscription lifecycle. The route shape is reserved; the resolver is a separate feature.
- Per-feature stable opaque IDs (e.g. `/app/f/{ulid}`). The ADR records this as a future option behind the handle layer; this feature does not introduce it.
- Server-side rendering or prerendering for OpenGraph / Twitter Card previews. Tracked separately if needed.
- Edge-level migration of the pre-canonical `/project?id={repo}@{org}@{git_host}` URL form. Existing links in the wild are not redirected; their authors update them to the canonical form. The pre-canonical form is dropped, not bridged.
- Migration of `/app/p/...` short-form URLs currently emitted by the `specscore` CLI to the canonical `/app/project/...` form. The migration story is a producer-side concern and belongs in the CLI's own plan.

## Dependencies

- authentication (for routes that resolve to gated content)
- project-page (consumes the parsed coordinates produced by this feature's route guard)

## Acceptance Criteria

### AC: path-canonical-resolves (verifies REQ:path-canonical-route, REQ:app-prefix-required)

Scenario: visiting a canonical path URL renders the project page
**Given** the user is authenticated and the underlying repository is accessible
**When** the user navigates to `/app/project/github.com/specscore/specscore/spec/features/feature/README.md`
**Then** Studio renders the project page for `github.com/specscore/specscore` with the addressed artifact path applied

### AC: handle-canonical-parses (verifies REQ:handle-canonical-route, REQ:handle-no-dots)

Scenario: a handle URL is recognized and parsed
**Given** Studio is loaded
**When** the user navigates to `/app/project/~acme/platform/spec/features/login.md`
**Then** the route guard parses `{handle: "acme", project_slug: "platform", path: "spec/features/login.md"}` and dispatches to the (future) handle resolver; no error chrome is rendered for the route shape itself

### AC: ref-pins-to-branch (verifies REQ:ref-query-param)

Scenario: an explicit `?ref` pins resolution to a specific branch
**Given** the underlying repository has a branch named `feature/login`
**When** the user navigates to `/app/project/github.com/specscore/specscore/spec/features/feature/README.md?ref=feature/login`
**Then** the project page resolves the artifact against the `feature/login` ref, not the default branch

### AC: ref-defaults-to-head (verifies REQ:ref-query-param)

Scenario: missing `?ref` resolves to the default branch
**Given** Studio is loaded
**When** the user navigates to `/app/project/github.com/specscore/specscore/spec/features/feature/README.md` with no `?ref`
**Then** the project page resolves the artifact at the repository's default branch

### AC: op-routes-to-operation (verifies REQ:op-query-param)

Scenario: `?op` selects a Studio operation
**Given** the user is on a project page route
**When** the user navigates to `…/spec/features/feature/README.md?op=explore`
**Then** the page renders in `explore` mode rather than the default read view

### AC: artifact-url-emits-without-ref (verifies REQ:artifact-urls-omit-ref-by-default)

Scenario: URLs in committed spec files do not pin a ref
**Given** an inspection of any URL written by the `specscore` CLI into a SpecScore artifact body
**When** the URL is parsed
**Then** the URL contains no `?ref=` query parameter

### AC: ref-inferred-from-referrer (verifies REQ:ref-inference-client-side)

Scenario: ref is inferred from a known forge referrer when not explicit
**Given** the user clicks a `specscore.studio` link from `https://github.com/specscore/specscore/blob/feature/x/spec/features/feature/README.md`
**When** the destination URL omits `?ref=`
**Then** Studio replaces the URL via `history.replaceState` to include `?ref=feature/x` and resolves the artifact at that ref

### AC: ref-inference-fallback-head (verifies REQ:ref-inference-client-side)

Scenario: missing or unrecognized referrer falls back to the default branch
**Given** the user navigates directly to a canonical path URL with no referrer (or with a referrer from a host that has no registered forge parser)
**When** the page bootstraps
**Then** Studio MUST NOT call `history.replaceState`, the URL bar retains the original ref-less form, no `?ref` is set on the route state, and the project page resolves at the default branch

### AC: unknown-host-rejected (verifies REQ:host-allowlist, REQ:unknown-host-rejection)

Scenario: an unrecognized host renders the unsupported-source page
**Given** Studio is loaded
**When** the user navigates to `/app/project/evil.example/foo/bar`
**Then** Studio renders the `unsupported-source` component and does not render the project sidebar, breadcrumbs, or README area

### AC: homoglyph-host-rejected (verifies REQ:host-idna-normalization, REQ:unknown-host-rejection)

Scenario: a Cyrillic-homoglyph host is normalized and rejected
**Given** Studio is loaded
**When** the user navigates to `/app/project/gіthub.com/foo/bar` where `і` is U+0456
**Then** the IDNA-normalized host fails the allow-list and Studio renders the `unsupported-source` component

### AC: no-fetch-host-templating (verifies REQ:no-host-templating-in-fetch)

Scenario: outbound fetches use a hardcoded base URL, not the URL-supplied host
**Given** the user navigates to a valid `github.com` route
**When** the project page issues a forge API call
**Then** the network request goes to the hardcoded `https://api.github.com/…` base mapped from the allow-list entry, never to a URL constructed from the `{git_host}` segment

### AC: path-decoded-once (verifies REQ:path-decoding-once)

Scenario: a path is decoded exactly once between the URL bar and the page component
**Given** the user navigates to `/app/project/github.com/foo/bar/spec/features/with%20space.md`
**When** the URL-scheme guard parses the path
**Then** the page component receives `spec/features/with space.md` (single decode), and no downstream consumer re-decodes

### AC: path-traversal-rejected (verifies REQ:path-traversal-rejection)

Scenario: a path containing `..` is rejected
**Given** Studio is loaded
**When** the user navigates to `/app/project/github.com/foo/bar/spec/../../../etc/passwd`
**Then** the URL-scheme guard rejects the path and Studio renders the `unsupported-source` component

### AC: null-byte-rejected (verifies REQ:path-traversal-rejection)

Scenario: a path containing a null byte is rejected
**Given** Studio is loaded
**When** the user navigates to `/app/project/github.com/foo/bar/spec/login%00.md`
**Then** the URL-scheme guard rejects the path and Studio renders the `unsupported-source` component

### AC: encoded-slash-rejected (verifies REQ:path-traversal-rejection)

Scenario: an encoded forward slash is rejected
**Given** Studio is loaded
**When** the user navigates to `/app/project/github.com/foo/bar/spec%2Flogin.md`
**Then** the URL-scheme guard rejects the path and Studio renders the `unsupported-source` component

### AC: referrer-policy-header-set (verifies REQ:referrer-policy-strict-origin)

Scenario: the Referrer-Policy header is set on every Studio response
**Given** any HTTP response from the `specscore.studio` origin
**When** the response headers are inspected
**Then** the response includes `Referrer-Policy: strict-origin`

### AC: handle-with-dot-rejected (verifies REQ:handle-no-dots)

Scenario: a handle segment containing a dot is rejected by the route parser
**Given** Studio is loaded
**When** the user navigates to `/app/project/~acme.io/platform`
**Then** the route guard rejects the URL and Studio renders the `unsupported-source` component, never the project chrome

## Open Questions

- Should ref inference (REQ: ref-inference-client-side) ship in v1 or be deferred to v1.1 as the ADR suggests? The current REQ uses MAY to permit either; the plan should decide.
- The `/app/p/` short form currently emitted by the `specscore` CLI into spec files must reconcile with the chosen `/app/project/` canonical. Migration is producer-side and is not solved here; flagging so it is not forgotten.
- Forge allow-list maintenance: where does the canonical list live (constant in code today; `specscore.yaml` extension in the future)? Decide before the second forge is added.
- UX copy on the unsupported-source page: the component is intentionally generic in this revision; finalize the wording before the v1 launch so it doesn't read as a Studio bug to a user who hit a bad URL.

---
*This document follows the https://specscore.md/feature-specification*
