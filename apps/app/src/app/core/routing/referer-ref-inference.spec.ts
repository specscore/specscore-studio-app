import {
  inferRefFromReferrer,
  parseGithubReferrer,
} from './referer-ref-inference';

describe('parseGithubReferrer', () => {
  it('extracts the ref from a github.com /blob/{ref}/{path} URL', () => {
    expect(
      parseGithubReferrer(
        new URL('https://github.com/specscore/specscore/blob/main/spec/features/login.md'),
      ),
    ).toBe('main');
  });

  it('extracts the first segment after /blob/ for multi-segment refs (documented limitation)', () => {
    // GitHub URLs for refs like `feature/x` are ambiguous from URL shape
    // alone. The parser returns 'feature'; the fetch likely 404s and the
    // page falls back to the default branch.
    expect(
      parseGithubReferrer(
        new URL('https://github.com/specscore/specscore/blob/feature/x/spec/login.md'),
      ),
    ).toBe('feature');
  });

  it('URL-decodes percent-encoded ref segments (e.g. release%2Fv1)', () => {
    expect(
      parseGithubReferrer(
        new URL('https://github.com/o/r/blob/release%2Fv1/path.md'),
      ),
    ).toBe('release/v1');
  });

  it('returns null for non-github.com hosts', () => {
    expect(
      parseGithubReferrer(new URL('https://gitlab.com/o/r/-/blob/main/path.md')),
    ).toBeNull();
    expect(
      parseGithubReferrer(new URL('https://evil.example/o/r/blob/main/path.md')),
    ).toBeNull();
  });

  it('returns null for github.com URLs that are not /blob/ paths', () => {
    expect(parseGithubReferrer(new URL('https://github.com/specscore/specscore'))).toBeNull();
    expect(
      parseGithubReferrer(new URL('https://github.com/specscore/specscore/issues/1')),
    ).toBeNull();
    expect(
      parseGithubReferrer(new URL('https://github.com/specscore/specscore/tree/main')),
    ).toBeNull();
  });

  it('returns null when /blob/ has no trailing path (no file to view)', () => {
    expect(parseGithubReferrer(new URL('https://github.com/o/r/blob/main'))).toBeNull();
    expect(parseGithubReferrer(new URL('https://github.com/o/r/blob/main/'))).toBeNull();
  });
});

describe('inferRefFromReferrer', () => {
  it('infers a ref from a recognized GitHub referrer', () => {
    expect(
      inferRefFromReferrer(
        'https://github.com/specscore/specscore/blob/main/spec/features/login.md',
      ),
    ).toBe('main');
  });

  it('returns null for an empty referrer (REQ:ref-inference-client-side fallback)', () => {
    expect(inferRefFromReferrer('')).toBeNull();
  });

  it('returns null for an opaque referrer scheme', () => {
    expect(inferRefFromReferrer('about:blank')).toBeNull();
    expect(inferRefFromReferrer('chrome-extension://abcd/popup.html')).toBeNull();
  });

  it('returns null for a malformed referrer string', () => {
    expect(inferRefFromReferrer('not a url')).toBeNull();
    expect(inferRefFromReferrer('://')).toBeNull();
  });

  it('returns null for a referrer from a host with no registered parser', () => {
    // GitLab, Bitbucket, Codeberg parsers are explicit follow-ups.
    expect(
      inferRefFromReferrer('https://gitlab.com/o/r/-/blob/main/spec/login.md'),
    ).toBeNull();
    expect(
      inferRefFromReferrer('https://bitbucket.org/o/r/src/main/spec/login.md'),
    ).toBeNull();
  });
});
