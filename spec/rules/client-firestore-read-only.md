# Rule: Client Firestore Read-Only

## Statement

The Hub client (Angular frontend) must never write to Firestore directly. All mutation operations (create, update, delete) must go through the SpecScore API.

## Rationale

- **Single source of truth for business logic**: keeping all write operations server-side ensures validation, authorization, and side-effects are handled consistently in one place.
- **Security**: Firestore Security Rules can be locked down to read-only for client credentials, reducing the attack surface.
- **Auditability**: every mutation flows through the API, making it straightforward to log, rate-limit, and monitor changes.

## What is allowed

- **Read** operations from Firestore (real-time listeners, one-time fetches) are permitted in the client.
- **Firebase Authentication** operations (sign-in, sign-out, token refresh) are permitted — these use Firebase Auth, not Firestore writes.

## What is prohibited

- Any direct call to Firestore `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`, `writeBatch`, or `runTransaction` that mutates data from client code.
- Using Firestore converters or references for write purposes in the client.

## How to comply

When implementing a feature that needs to create, update, or delete data:

1. Add or use an endpoint in the SpecScore API (`specscore-cloud`).
2. Call that endpoint from the Hub client via `ApiService` (or `HttpClient` pointed at `environment.apiBaseUrl`).
3. If the client needs to reflect the change in real time, subscribe to the corresponding Firestore document/collection for read-only updates.
