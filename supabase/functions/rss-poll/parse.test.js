import { describe, it, expect } from 'vitest';
import { parseFeedItems, buildNewsRows } from './parse.js';

const RSS2 = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Feed</title>
  <item>
    <title>Drone inspection demand rises in offshore O&amp;G</title>
    <link>https://example.com/articles/drone-demand</link>
    <pubDate>Mon, 22 Sep 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title><![CDATA[ROV market <report> published]]></title>
    <link>https://example.com/articles/rov-report</link>
    <pubDate>Tue, 23 Sep 2026 10:30:00 GMT</pubDate>
  </item>
  <item>
    <title>Missing link, should be dropped</title>
    <pubDate>Wed, 24 Sep 2026 10:30:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Crawler NDT certification update</title>
    <link rel="self" href="https://example.com/feed/entry/1"/>
    <link rel="alternate" href="https://example.com/entry/1"/>
    <updated>2026-09-20T12:00:00Z</updated>
  </entry>
  <entry>
    <title>Second entry, no rel attr</title>
    <link href="https://example.com/entry/2"/>
    <published>2026-09-19T08:00:00Z</published>
  </entry>
</feed>`;

describe('parseFeedItems (RSS 2.0)', () => {
  it('extracts title/url/date per item', () => {
    const items = parseFeedItems(RSS2);
    expect(items).toHaveLength(2); // the linkless 3rd item is dropped
    expect(items[0]).toEqual({
      title: 'Drone inspection demand rises in offshore O&G',
      url: 'https://example.com/articles/drone-demand',
      date: 'Mon, 22 Sep 2026 09:00:00 GMT',
    });
  });

  it('unwraps CDATA-wrapped titles', () => {
    const items = parseFeedItems(RSS2);
    expect(items[1].title).toBe('ROV market <report> published');
  });

  it('drops items with no link', () => {
    const items = parseFeedItems(RSS2);
    expect(items.some(it => it.title.includes('Missing link'))).toBe(false);
  });

  it('returns [] for empty/garbage input', () => {
    expect(parseFeedItems('')).toEqual([]);
    expect(parseFeedItems('not xml at all')).toEqual([]);
  });
});

describe('parseFeedItems (Atom)', () => {
  it('prefers rel="alternate" over rel="self"', () => {
    const items = parseFeedItems(ATOM);
    expect(items[0].url).toBe('https://example.com/entry/1');
  });

  it('falls back to a rel-less <link> and to <published> when <updated> is absent', () => {
    const items = parseFeedItems(ATOM);
    expect(items[1]).toEqual({
      title: 'Second entry, no rel attr',
      url: 'https://example.com/entry/2',
      date: '2026-09-19T08:00:00Z',
    });
  });
});

describe('buildNewsRows', () => {
  it('maps parsed items to upsert-ready news_items rows', () => {
    const items = parseFeedItems(RSS2);
    const rows = buildNewsRows(items, 'Example Feed');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: 'Drone inspection demand rises in offshore O&G',
      source: 'Example Feed',
      url: 'https://example.com/articles/drone-demand',
      date: '2026-09-22',
      kind: null, ref_id: null, live: true, dismissed_at: null, dismissed_by: null,
    });
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('falls back to today when a date is missing/unparseable', () => {
    const rows = buildNewsRows([{ title: 'No date', url: 'https://example.com/x' }], 'Src');
    expect(rows[0].date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('truncates titles at 500 chars (news_items.title check constraint)', () => {
    const long = 'x'.repeat(600);
    const rows = buildNewsRows([{ title: long, url: 'https://example.com/y' }], 'Src');
    expect(rows[0].title).toHaveLength(500);
  });

  it('re-parsing the same feed twice produces rows with the same url (idempotent upsert key)', () => {
    const rowsA = buildNewsRows(parseFeedItems(RSS2), 'Example Feed');
    const rowsB = buildNewsRows(parseFeedItems(RSS2), 'Example Feed');
    expect(rowsA.map(r => r.url)).toEqual(rowsB.map(r => r.url));
    // ids differ (fresh insert each parse) -- the DB's ON CONFLICT(url) is what
    // actually dedupes; this only proves the conflict key stays stable.
    expect(rowsA[0].id).not.toBe(rowsB[0].id);
  });
});
