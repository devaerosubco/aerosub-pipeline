// Insights tab (V2 HT-G) — read-only aggregations, item 7. No new tables.
// research_clips is loaded client-side bounded/paginated (RESEARCH_PAGE),
// so DATA.research.length would undercount past 200 — this does a real
// COUNT query instead. RFQs/tasks/companies aren't paginated, so their
// already-loaded arrays (RFQ_DATA.rfqs / DATA.tasks / DATA.companies) are
// aggregated client-side in main.js directly, no extra query needed.
import { supabase } from '../supabase.js';

export async function researchTotals() {
  const { count, error } = await supabase.from('research_clips').select('*', { count: 'exact', head: true });
  if (error) throw error;
  // One lightweight column, every row — cheap, and PostgREST has no
  // distinct-count aggregate reachable from the JS client, so dedupe here.
  const { data, error: e2 } = await supabase.from('research_clips').select('created_by');
  if (e2) throw e2;
  const contributors = new Set((data || []).map(r => r.created_by).filter(Boolean));
  return { total: count || 0, contributors: contributors.size };
}

// Addendum item 5 — org-wide task counts, bypassing HT-F's per-row
// visibility RLS via a SECURITY DEFINER RPC (20260925140001). Only grouped
// counts ever cross this boundary, never individual task rows, so it
// doesn't leak what HT-F was built to hide.
export async function taskCountsBySector() {
  const { data, error } = await supabase.rpc('task_counts_by_sector');
  if (error) throw error;
  return (data || []).map(r => ({ sector: r.sector, count: Number(r.task_count) }));
}
export async function taskCountsByOwner() {
  const { data, error } = await supabase.rpc('task_counts_by_owner');
  if (error) throw error;
  return (data || []).map(r => ({ ownerId: r.owner_id || '', count: Number(r.task_count) }));
}
