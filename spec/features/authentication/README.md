# Feature: Authentication

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/authentication?op=explore) | [Edit](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/authentication?op=edit) | [Ask question](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/authentication?op=ask) | [Request change](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/authentication?op=request-change) |

**Status:** Conceptual

## Summary

Authentication in SpecScore App uses Firebase Authentication with GitHub as the OAuth provider. Users sign in with minimal permissions (`read:user`), and additional GitHub scopes are requested incrementally when specific actions require them. Firebase manages sessions and token refresh.

## Problem

SpecScore App needs to identify users, associate them with their GitHub repos, and make authenticated GitHub API calls on their behalf. Requesting broad permissions upfront creates sign-in friction and erodes trust. The system needs a way to start with minimal access and escalate only when the user takes an action that requires it.

## Behavior

### Initial sign-in flow

1. User clicks "Continue with GitHub" (on the home page sign-in card or the nav bar).
2. Firebase Auth triggers `signInWithPopup` (or `signInWithRedirect` on mobile) using the GitHub provider with `read:user` scope.
3. GitHub prompts the user to authorize the app.
4. On success, Firebase Auth creates/updates the user record and returns a `UserCredential` containing the GitHub access token.
5. The GitHub access token from the initial sign-in is stored in Firestore under the user's UID for later API calls.
6. The user is now signed in — the home page Projects card updates to show their personal projects.

### Incremental scope upgrade

1. The user takes an action that requires a scope not yet granted (e.g., `repo` for accessing private repositories).
2. The app shows a consent explanation — what permission is needed and why.
3. The app redirects to GitHub's authorize URL (`https://github.com/login/oauth/authorize`) with the additional scopes.
4. On callback, the app receives a new GitHub access token with the upgraded scopes.
5. The upgraded token is stored in Firestore, replacing the previous one.
6. The original action resumes.

### Sign-out

1. User clicks "Sign out" in the nav.
2. Firebase `signOut()` is called, clearing the session.
3. The user remains on the current page if it supports unsigned viewing (e.g., public project page). If the page requires authentication, the user is redirected to the home page.
4. The stored GitHub token in Firestore is **not** deleted — it remains valid until the user revokes access on GitHub or a scope upgrade replaces it.

### Firestore user record

On each auth event, the following timestamps are updated on the user document in Firestore:

- **`lastSignInAt`** — updated on sign-in
- **`lastSignOutAt`** — updated on sign-out

These are stored alongside the GitHub access token under the user's UID.

### Token lifecycle

- GitHub OAuth tokens (standard OAuth App) do not expire.
- If a user revokes the app's access on GitHub, API calls will fail — handled at the point of failure, not proactively.
- The GitHub App (for repo integration) is a separate feature and not used for web UI authentication.

### Session management

- Fully delegated to Firebase Authentication.
- Firebase handles token refresh, session persistence across tabs, and device management.
- No custom session logic.

### Auth state in the UI

- Components observe Firebase's `authStateChanges` stream to reactively update.
- No loading of authenticated content until auth state is resolved (avoid flash of wrong state).

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-1 | User can sign in via GitHub with `read:user` scope using Firebase Auth. |
| AC-2 | GitHub access token is stored in Firestore under the user's UID. |
| AC-3 | `lastSignInAt` is updated on sign-in, `lastSignOutAt` on sign-out. |
| AC-4 | After sign-out, the user remains on the current page if it supports unsigned viewing (determined by route configuration). If the page requires authentication, the user is redirected to the home page. |
| AC-5 | Incremental scope upgrade stores the new token in Firestore, replacing the previous one. |

## Open Questions

- What specific actions will trigger each incremental scope upgrade? (Define per-scope as those features are specified.)
- Should the consent explanation before scope upgrade be a modal, a redirect page, or inline in the triggering UI?
- How are GitHub access tokens in Firestore protected? (e.g., Firestore security rules restricting access to server-side only via Firebase Admin SDK, or client-readable by the owning user only.)
- How does the incremental scope upgrade callback work? The flow bypasses Firebase Auth and requires a server-side token exchange (OAuth client secret). Does this use a Firebase Cloud Function or another backend endpoint?
- Should mobile sign-in (`signInWithRedirect`) be tested as a separate acceptance criterion, or is it covered implicitly by AC-1?

---
*This document follows the https://specscore.md/feature-specification*
