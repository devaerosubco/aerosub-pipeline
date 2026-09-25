// V2 HT-H: RSS feed connector -- polls every admin-managed rss_sources row,
// upserts new items into news_items (live=true). Scheduled on pg_cron via
// pg_net (20260925120003_rss_cron.sql); can also be invoked directly for a
// manual "refresh now" (`supabase functions invoke rss-poll`) or by curl.
//
// Deno Edge Function -- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by the platform into every function's env, so
// nothing secret is hardcoded here or passed in the request body.
//
// Named index.ts (not .js, unlike the rest of this all-JS project) because
// the Supabase CLI's function discovery specifically globs for that
// filename -- confirmed locally: an index.js in this same folder was
// silently invisible to `supabase functions serve` ("Functions config: {}",
// then 404 "Function not found" on every invoke) until renamed. No
// TypeScript syntax is actually used; parse.js (the real logic, imported
// below) stays plain .js and is unit-tested directly by vitest.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseFeedItems, buildNewsRows } from './parse.js';

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data: sources, error: srcErr } = await supabase.from('rss_sources').select('id, name, url');
  if (srcErr) {
    return new Response(JSON.stringify({ error: srcErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let upserted = 0;
  const errors = [];

  // Sequential, not Promise.all: keeps this cheap Edge Function's memory/
  // concurrency small, and one slow/broken feed shouldn't race the others.
  for (const source of sources || []) {
    try {
      const res = await fetch(source.url, { headers: { 'User-Agent': 'AerosubPipeline-RSSPoll/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const items = parseFeedItems(xml);
      const rows = buildNewsRows(items, source.name);

      if (rows.length) {
        const { error: upsertErr } = await supabase.from('news_items').upsert(rows, { onConflict: 'url' });
        if (upsertErr) throw upsertErr;
        upserted += rows.length;
      }

      await supabase.from('rss_sources').update({ last_polled_at: new Date().toISOString() }).eq('id', source.id);
    } catch (e) {
      errors.push({ source: source.name, url: source.url, message: e.message || String(e) });
    }
  }

  return new Response(
    JSON.stringify({ sourcesPolled: (sources || []).length, itemsUpserted: upserted, errors }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
