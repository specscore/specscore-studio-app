// Hardcoded forge-API base URLs per REQ:no-host-templating-in-fetch.
//
// The point of this module is to make SSRF structurally impossible: Studio
// MUST NOT template `{git_host}` into outbound fetch URLs. Each allow-listed
// forge maps to a fixed, hardcoded API base here. The mapping lives in
// source (not config) so additions require code review.
//
// Adding a forge means editing forge-host.allowlist.ts AND this file in the
// same change. The unit test asserts the two stay in sync.

/** The hardcoded forge → API base mapping. Keyed by allow-listed host. */
export const FORGE_API_BASES: Readonly<Record<string, string>> = {
  'github.com': 'https://api.github.com',
  'gitlab.com': 'https://gitlab.com/api/v4',
  'bitbucket.org': 'https://api.bitbucket.org/2.0',
  'codeberg.org': 'https://codeberg.org/api/v1',
};

/**
 * Returns the hardcoded API base URL for an allow-listed forge host.
 * Throws on unknown hosts — callers are expected to have already passed the
 * host through `isAllowedForgeHost()`. The throw is a defensive guarantee
 * that an attacker-controlled host can never reach an outbound fetch.
 */
export function forgeApiBase(host: string): string {
  const base = FORGE_API_BASES[host];
  if (!base) {
    throw new Error(
      `forgeApiBase: host "${host}" is not on the allow-list; outbound fetch refused.`,
    );
  }
  return base;
}
