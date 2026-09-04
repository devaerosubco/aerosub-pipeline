import { describe, it, expect } from 'vitest';
import { emailRule, normalizeLinkedin, validateChanged } from './validate.js';

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
