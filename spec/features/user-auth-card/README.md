# Feature: User Auth Card

> [SpecScore.**Studio**](https://specscore.studio): | [Explore](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/user-auth-card?op=explore) | [Edit](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/user-auth-card?op=edit) | [Ask question](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/user-auth-card?op=ask) | [Request change](https://specscore.studio/app/github.com/specscore/specscore-studio-app/spec/features/user-auth-card?op=request-change) |

**Status:** Conceptual

## Summary

The home page shows a sign-in card when the user is unauthenticated and a user auth card when authenticated. The user auth card displays a list of supported auth providers with their linked/unlinked status, allowing users to connect additional identity providers to their account.

## Problem

Currently, the home page always shows the "Sign in with GitHub" card regardless of auth state. Once signed in, the user has no visibility into which identity providers are linked to their account and no way to link additional ones. The user needs a card that reflects their authenticated state and gives them control over their linked providers.

## Behavior

### Card switching

The first card slot on the home page switches based on authentication state:

- **Unauthenticated:** Shows the `sign-in-card` component — the existing "Sign in with GitHub" card extracted into a standalone component.
- **Authenticated:** Shows the `user-auth-card` component — displays the user's linked providers.

### Sign-in card (unauthenticated)

Identical to the current card: GitHub icon, title "Sign in with GitHub", description text, and "Continue with GitHub" button that triggers the GitHub OAuth popup directly (no login page redirect).

### User auth card (authenticated)

Displays a list of supported auth providers. Each row shows:

- Provider icon and name
- Link status: a badge/indicator showing whether the provider is linked
- Action: "Connect" button if unlinked; "Connected | X" tag if linked (X disconnects the provider)

#### Supported providers

| Provider  | Icon             | Required | Notes |
|-----------|------------------|----------|-------|
| GitHub    | `pi pi-github`   | Yes      | Primary auth provider; always linked for authenticated users |
| Email     | `pi pi-envelope`  | No       | Firebase Email/Password provider |
| Phone     | `pi pi-phone`     | No       | Firebase Phone provider |
| Google    | `pi pi-google`    | No       | Firebase Google provider |
| Microsoft | `pi pi-microsoft` | No       | Firebase Microsoft provider |
| Apple     | `pi pi-apple`     | No       | Firebase Apple provider |

#### Provider link status

The card reads the current user's `providerData` array from Firebase Auth to determine which providers are linked. Each provider in Firebase Auth has a `providerId`:

- `github.com`
- `password` (email)
- `phone`
- `google.com`
- `microsoft.com`
- `apple.com`

#### Connecting a provider

When the user clicks "Connect" on an unlinked provider, the app initiates Firebase Auth's `linkWithPopup` (or the appropriate linking method for the provider type). On success, the provider appears as linked. On failure, an error message is shown.

**Note:** Linking operations use Firebase Auth SDK directly — these are identity linking operations, not Firestore writes, so they comply with the client-firestore-read-only rule.

#### Disconnecting a provider

Linked providers (except the last remaining one) can be disconnected. The "Connected" tag includes an "X" button rendered as "Connected | X". Clicking X calls Firebase Auth's `unlink(providerId)` on the current user, removing that provider from the account.

**Guard rails:**
- A user must always have at least one linked provider. If only one provider remains, the X button is hidden to prevent the user from locking themselves out.
- GitHub is treated the same as other providers for unlinking — it can be disconnected as long as another provider remains linked.

**Note:** Unlinking uses Firebase Auth SDK directly (`user.unlink(providerId)`) — this is an identity operation, not a Firestore write.

### Component architecture

Both components are standalone Angular components:

- `sign-in-card` — extracted from the current inline template in `home.ts`
- `user-auth-card` — new component showing provider list with link status

The home page imports both and switches between them using `@if (authService.isAuthenticated())`.

## Dependencies

- authentication

## Acceptance Criteria

Not defined yet.

## Open Questions

- Should linking a provider show a confirmation toast/message on success?
- What error handling should be shown if provider linking fails (e.g., account already linked to another user)?
- ~~Should there be an "Unlink" action for optional providers, or is linking one-way?~~ **Resolved:** Yes — linked providers show "Connected | X" where X disconnects the provider. The last remaining provider cannot be disconnected.

---
*This document follows the https://specscore.md/feature-specification*
