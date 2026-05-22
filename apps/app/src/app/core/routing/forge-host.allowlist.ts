// Maintained allow-list of forge hosts that Studio accepts as the `{git_host}`
// coordinate, per REQ:host-allowlist in spec/features/studio-url-scheme.
//
// The list lives in source so additions require code review (a deliberate
// constraint from the spec — not configuration). Adding a forge means
// editing this file AND adding its hardcoded API base in
// forge-api-base.ts (Task 6).

export const ALLOWED_FORGE_HOSTS = new Set<string>([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
]);

/**
 * Normalize an untrusted host segment to canonical lowercase ASCII via
 * NFC + URL parser's IDNA toASCII (punycode) pipeline, per
 * REQ:host-idna-normalization.
 *
 * Returns `null` when the input cannot be parsed as a hostname (e.g. it
 * contains spaces, is empty, or otherwise fails URL parsing). Callers
 * MUST treat `null` as a rejection.
 *
 * The URL parser does the heavy lifting: it lowercases ASCII and applies
 * IDNA toASCII to non-ASCII characters, producing the canonical form
 * `xn--…` for IDN labels. NFC normalization is applied first so that
 * combining-character sequences are folded to the same canonical code
 * points the parser expects.
 */
export function normalizeForgeHost(input: string): string | null {
  if (!input) return null;
  try {
    const nfc = input.normalize('NFC');
    // The URL parser handles lowercasing and IDNA toASCII for us.
    return new URL(`https://${nfc}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns true iff `input` normalizes to a host on the allow-list.
 * Defeats homoglyph spoofs (e.g. Cyrillic `і` in `gіthub.com`) because
 * the IDNA-normalized form is punycode, which never equals the canonical
 * `github.com` allow-list entry.
 */
export function isAllowedForgeHost(input: string): boolean {
  const normalized = normalizeForgeHost(input);
  return normalized !== null && ALLOWED_FORGE_HOSTS.has(normalized);
}
