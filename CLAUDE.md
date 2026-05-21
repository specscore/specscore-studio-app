<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Error handling — no silent failures

Every data load in the app UI must surface failures to the user. Silent catch blocks, console-only logs, or spinners that quietly stop without explanation are not acceptable.

**Rules**

- **Inline error state at the expected result location.** When a component loads data (HTTP call, Firestore query, observable stream), the component must track an `error` signal/field alongside its `loading` and `data` state. On failure, render the error message _in the same place the results would have appeared_ — e.g., a `p-message` inside the card, a row in the table, a banner in the panel. Users must not be left staring at an empty placeholder or a stuck spinner.
- **Provide a retry path when re-subscribing is practical.** For onSnapshot listeners and idempotent HTTP GETs, render a "Retry" button next to the error that re-runs the load. Track a retry tick signal that the data-loading `effect()` reads as a reactive dependency, then bump it in the retry handler to force re-subscription.
- **Use a toast for non-blocking background errors.** Actions the user triggered but that don't block a visible result area (background sync, fire-and-forget mutations, telemetry) should surface failures via a PrimeNG toast (`MessageService.add({ severity: 'error', ... })`). The toast must be in addition to, not instead of, an inline error if a result area exists.
- **Never swallow errors.** `subscribe({ error: () => {} })`, empty `catch`, and "log only" handlers are forbidden. At minimum, the error path must set an error signal or dispatch a toast. `console.error(err)` is fine to keep for devtools, but must accompany user-visible surfacing, not replace it.
- **Error messages should be user-actionable.** Prefer "Failed to load projects. Please try again." over "Error: FirebaseError permission-denied". Keep raw errors in `console.error` for debugging; show plain language in the UI.
