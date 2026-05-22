// Client-side Referer-based ref inference per REQ:ref-inference-client-side
// (spec/features/studio-url-scheme).
//
// When a user clicks a specscore.studio link from a known forge URL whose
// path encodes a git ref (e.g. GitHub `/blob/{ref}/{path}`), Studio infers
// that ref and replaces the URL via history.replaceState so the artifact
// resolves at the right revision instead of the default branch.
//
// Why client-side, not server-side: per the Feature, server-side inference
// (a Vary: Referer redirect at the edge) would shatter the CDN cache key.
// Client-side keeps (URL, query) as the cache key and runs at zero cost
// when the referrer is absent or unrecognized.
//
// Limitation acknowledged in the Feature's Outstanding Questions: GitHub
// URLs for multi-segment refs like `feature/x` are ambiguous from URL
// shape alone — `/blob/feature/x/path.md` could mean ref `feature` +
// path `x/path.md` or ref `feature/x` + path `path.md`. The single-segment
// parser below extracts the first segment after `/blob/`. Multi-segment
// refs degrade gracefully: the inference returns the first segment, the
// fetch against that ref likely 404s, the page falls back to the default
// branch via the existing error path. A future parser can resolve via the
// forge API if needed.

/** A forge-specific referrer parser. Returns the inferred ref or null. */
export type RefereeParser = (referrerUrl: URL) => string | null;

const GITHUB_BLOB_RE = /^\/[^/]+\/[^/]+\/blob\/([^/]+)\/.+$/;

/**
 * GitHub parser: matches `https://github.com/{owner}/{repo}/blob/{ref}/{path}`
 * and returns the first segment after `/blob/`. See the file header for the
 * single-segment limitation.
 */
export const parseGithubReferrer: RefereeParser = (referrer) => {
  if (referrer.hostname !== 'github.com') return null;
  const match = referrer.pathname.match(GITHUB_BLOB_RE);
  if (!match || !match[1]) return null;
  return decodeURIComponent(match[1]);
};

/**
 * The registry of forge parsers. Tried in order; first non-null wins.
 * Adding a parser (GitLab `/-/blob/{ref}/`, Bitbucket `/src/{ref}/`,
 * Codeberg `/src/branch/{ref}/`, etc.) is a code change here — the
 * consumer in inferRefFromReferrer doesn't need to know.
 */
const PARSERS: RefereeParser[] = [parseGithubReferrer];

/**
 * Returns the inferred ref from a referrer string, or null when:
 *   - the referrer is absent (empty string),
 *   - the referrer fails URL parsing,
 *   - the referrer is opaque (e.g. about:, chrome-extension:),
 *   - no registered parser recognizes the URL,
 *   - the recognized parser returns null.
 *
 * This is best-effort: the caller MUST fall back to the default-branch
 * behavior when this returns null (REQ:ref-inference-client-side).
 */
export function inferRefFromReferrer(referrer: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  // Opaque schemes don't carry useful path information.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  for (const parser of PARSERS) {
    const ref = parser(url);
    if (ref) return ref;
  }
  return null;
}
