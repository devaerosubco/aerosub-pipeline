// Pure RSS 2.0 / Atom parsing + row-building for the rss-poll Edge Function
// (V2 HT-H, PRD-v2 §8). Hand-rolled regex parsing, not a full XML parser --
// the same "avoid an unnecessary parsing dependency" call src/csv.js made
// for bulk upload (V2 HT-B). Good enough for the well-formed feeds real
// publishers emit; deliberately not a general-purpose XML parser.
//
// No imports (Deno-safe): this file is loaded both by the Edge Function
// (index.js, same directory) and directly by vitest (parse.test.js) via a
// plain relative import, with zero Deno- or Node-specific globals besides
// `crypto.randomUUID()`, which both runtimes provide natively.

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
}

// Atom <link> is a self-closing element with an href attribute, and a feed
// may list several (rel="alternate", rel="self", ...) -- prefer the one
// that's either explicitly "alternate" or has no rel at all.
function atomLink(block) {
  for (const [, attrs] of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    if (!/rel=/i.test(attrs) || /rel=["']alternate["']/i.test(attrs)) {
      const m = attrs.match(/href=["']([^"']+)["']/i);
      if (m) return decodeEntities(m[1]);
    }
  }
  return '';
}

export function parseFeedItems(xmlText) {
  const text = String(xmlText || '');
  const items = [];
  for (const m of text.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    items.push({ title: tagText(block, 'title'), url: tagText(block, 'link'), date: tagText(block, 'pubDate') });
  }
  for (const m of text.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const block = m[1];
    items.push({ title: tagText(block, 'title'), url: atomLink(block), date: tagText(block, 'updated') || tagText(block, 'published') });
  }
  return items.filter(it => it.title && it.url);
}

function toDateOnly(rawDate) {
  const d = rawDate ? new Date(rawDate) : null;
  if (!d || Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Rows ready for `.upsert(rows, { onConflict: 'url' })` against news_items
// (news_items_url_key, 20260925120002_rss_sources.sql) -- re-polling the
// same feed re-upserts the same url and never creates a duplicate row.
export function buildNewsRows(items, sourceName) {
  return items.map(it => ({
    id: crypto.randomUUID(),
    title: it.title.slice(0, 500),
    source: sourceName || null,
    url: it.url,
    date: toDateOnly(it.date),
    kind: null,
    ref_id: null,
    live: true,
    dismissed_at: null,
    dismissed_by: null,
  }));
}
