import { describe, it, expect } from 'vitest';
import { normalizeUrl, clipToRow, isValidClip, flushQueue } from './clips.js';

describe('normalizeUrl', () => {
  it('strips scheme + www + a bare trailing slash, keeps a real path', () => {
    expect(normalizeUrl('https://www.example.com/')).toBe('example.com');
    expect(normalizeUrl('http://example.com/a/b')).toBe('example.com/a/b');
    expect(normalizeUrl('')).toBe('');
  });
});

describe('clipToRow', () => {
  it('maps the extension clip shape to a research_clips row', () => {
    const row = clipToRow({
      title: '  A page  ', url: 'https://www.foo.com/x', summary: 's', potential: 'p',
      contactName: 'Jane', contactEmail: 'jane@example.com', contactPhone: '+1',
      contactLinkedin: 'https://linkedin.com/in/jane', capturedAt: '2026-08-01T00:00:00Z',
    }, 'user-1');
    expect(row.title).toBe('A page');
    expect(row.url).toBe('foo.com/x');
    expect(row.contact_name).toBe('Jane');
    expect(row.contact_linkedin).toBe('linkedin.com/in/jane');
    expect(row.company_id).toBeNull();
    expect(row.created_by).toBe('user-1');
    expect(typeof row.id).toBe('string');
  });
  it('empty optional fields become null', () => {
    const row = clipToRow({ title: 'T' }, 'u');
    expect(row.url).toBeNull();
    expect(row.summary).toBeNull();
    expect(row.contact_email).toBeNull();
  });
});

describe('isValidClip', () => {
  it('requires a non-empty title', () => {
    expect(isValidClip({ title: 'x' })).toBe(true);
    expect(isValidClip({ title: '   ' })).toBe(false);
    expect(isValidClip(null)).toBe(false);
  });
});

describe('flushQueue', () => {
  it('inserts all valid clips and clears them on success', async () => {
    let inserted = null;
    const res = await flushQueue(
      [{ title: 'A' }, { title: 'B' }, { notitle: true }],
      'u',
      async (rows) => { inserted = rows; },
    );
    expect(res.synced).toBe(2);
    expect(inserted).toHaveLength(2);
    // the invalid one is dropped, not kept
    expect(res.remaining).toHaveLength(0);
  });

  it('keeps the whole queue when the insert fails (offline)', async () => {
    const queue = [{ title: 'A' }, { title: 'B' }];
    const res = await flushQueue(queue, 'u', async () => { throw new Error('offline'); });
    expect(res.synced).toBe(0);
    expect(res.remaining).toEqual(queue);
    expect(res.error).toBeTruthy();
  });

  it('no-ops on an empty queue', async () => {
    const res = await flushQueue([], 'u', async () => { throw new Error('should not be called'); });
    expect(res.synced).toBe(0);
  });
});
