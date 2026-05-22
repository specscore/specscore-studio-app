import {
  ALLOWED_FORGE_HOSTS,
  isAllowedForgeHost,
  normalizeForgeHost,
} from './forge-host.allowlist';

describe('ALLOWED_FORGE_HOSTS', () => {
  it('contains the four initial forges from the spec', () => {
    expect(ALLOWED_FORGE_HOSTS).toEqual(
      new Set(['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']),
    );
  });
});

describe('normalizeForgeHost', () => {
  it('returns lowercase ASCII for canonical hosts', () => {
    expect(normalizeForgeHost('github.com')).toBe('github.com');
    expect(normalizeForgeHost('GitHub.com')).toBe('github.com');
    expect(normalizeForgeHost('GITHUB.COM')).toBe('github.com');
  });

  it('IDNA-encodes a Cyrillic homoglyph host to punycode', () => {
    // The first character is U+0456 (Cyrillic small letter Byelorussian-
    // Ukrainian i), NOT the ASCII 'i' in github.com.
    const normalized = normalizeForgeHost('gіthub.com');
    expect(normalized).not.toBe('github.com');
    expect(normalized).toMatch(/^xn--/);
  });

  it('returns null for invalid hostnames', () => {
    expect(normalizeForgeHost('')).toBeNull();
    expect(normalizeForgeHost('not a host')).toBeNull();
  });
});

describe('isAllowedForgeHost', () => {
  it('accepts all four allow-listed forges', () => {
    expect(isAllowedForgeHost('github.com')).toBe(true);
    expect(isAllowedForgeHost('gitlab.com')).toBe(true);
    expect(isAllowedForgeHost('bitbucket.org')).toBe(true);
    expect(isAllowedForgeHost('codeberg.org')).toBe(true);
  });

  it('accepts case variations of allow-listed hosts', () => {
    expect(isAllowedForgeHost('GitHub.com')).toBe(true);
    expect(isAllowedForgeHost('GITHUB.COM')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedForgeHost('evil.example')).toBe(false);
    expect(isAllowedForgeHost('attacker.com')).toBe(false);
  });

  it('rejects Cyrillic homoglyph spoofs of github.com (REQ:host-idna-normalization)', () => {
    // U+0456 in place of ASCII 'i' — should NOT be treated as github.com.
    expect(isAllowedForgeHost('gіthub.com')).toBe(false);
  });

  it('rejects malformed inputs', () => {
    expect(isAllowedForgeHost('')).toBe(false);
    expect(isAllowedForgeHost('not a host')).toBe(false);
  });
});
