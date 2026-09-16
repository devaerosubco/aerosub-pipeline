import { describe, it, expect } from 'vitest';
import { emailRule, normalizeLinkedin, normalizeUrlish, urlRule, dateRule, validateChanged } from './validate.js';

describe('emailRule', () => {
  it('accepts empty (not public)', () => { expect(emailRule('')).toBeNull(); });
  it('accepts a normal address', () => { expect(emailRule('jane@example.com')).toBeNull(); });
  it('rejects something with no @', () => { expect(emailRule('not-an-email')).not.toBeNull(); });
});

describe('normalizeLinkedin', () => {
  it('strips https:// and www.', () => {
    expect(normalizeLinkedin('https://www.linkedin.com/in/jane')).toBe('linkedin.com/in/jane');
  });
  it('leaves an already scheme-less value alone', () => {
    expect(normalizeLinkedin('linkedin.com/in/jane')).toBe('linkedin.com/in/jane');
  });
  it('empty stays empty', () => { expect(normalizeLinkedin('')).toBe(''); });
});

describe('normalizeUrlish', () => {
  it('is the same function normalizeLinkedin aliases, usable for any scheme-less field', () => {
    expect(normalizeUrlish('https://www.example.com/page')).toBe('example.com/page');
    expect(normalizeUrlish).toBe(normalizeLinkedin);
  });
  it('strips a lone trailing slash on a bare domain but keeps a real path intact', () => {
    expect(normalizeUrlish('https://www.thecyberhawk.com/')).toBe('thecyberhawk.com');
    expect(normalizeUrlish('linkedin.com/in/jane/')).toBe('linkedin.com/in/jane/');
  });
});

describe('urlRule', () => {
  it('accepts empty, a bare domain, and a path', () => {
    expect(urlRule('')).toBeNull();
    expect(urlRule('https://www.example.com')).toBeNull();
    expect(urlRule('linkedin.com/in/jane')).toBeNull();
  });
  it('rejects whitespace and non-domain junk', () => {
    expect(urlRule('not a url')).not.toBeNull();
    expect(urlRule('hello')).not.toBeNull();
  });
});

describe('dateRule', () => {
  it('accepts empty and a real ISO date', () => {
    expect(dateRule('')).toBeNull();
    expect(dateRule('2026-09-30')).toBeNull();
  });
  it('rejects a bad shape or an impossible date', () => {
    expect(dateRule('30/09/2026')).not.toBeNull();
    expect(dateRule('2026-13-40')).not.toBeNull();
  });
});

describe('validateChanged', () => {
  const rules = { email: emailRule };

  it('does not validate a field that did not change — a masked seeded email must not block an unrelated edit', () => {
    const before = { email: '@greenenergy.ng (address masked)', phone: '' };
    const after = { email: before.email, phone: '+234 1 234 5678' };
    const { ok, errors } = validateChanged(before, after, rules);
    expect(ok).toBe(true);
    expect(errors).toEqual({});
  });

  it('validates a field that did change', () => {
    const before = { email: '' };
    const after = { email: 'not-an-email' };
    const { ok, errors } = validateChanged(before, after, rules);
    expect(ok).toBe(false);
    expect(errors.email).toBeTruthy();
  });

  it('accepts a valid changed email', () => {
    const before = { email: '' };
    const after = { email: 'jane@example.com' };
    expect(validateChanged(before, after, rules).ok).toBe(true);
  });
});
