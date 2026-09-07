// Competitors (PRD §6.9) + their campaign timeline (§6.10).
import { write } from '../api.js';
import { competitorToRow, competitorFromRow, campaignToRow, campaignFromRow } from '../store.js';

export async function create(competitor) {
  const row = { id: competitor.id, ...competitorToRow(competitor) };
  const saved = await write('competitors', 'insert', { row });
  return competitorFromRow(saved);
}

// name/hq/website — E-1.
export async function editIdentity(id, { name, hq, website }) {
  const row = {};
  if (name !== undefined) row.name = name;
  if (hq !== undefined) row.hq = hq || null;
  if (website !== undefined) row.website = website || null;
  await write('competitors', 'update', { row, match: { id } });
}

export async function setModality(id, modality) {
  await write('competitors', 'update', { row: { modality }, match: { id } });
}
export async function setThreat(id, threat) {
  await write('competitors', 'update', { row: { threat }, match: { id } });
}
export async function setNotes(id, notes) {
  await write('competitors', 'update', { row: { notes: notes || null }, match: { id } });
}
export async function remove(id) {
  await write('competitors', 'delete', { match: { id } }); // campaigns cascade in the DB
}

export async function createCampaign(competitorId, campaign) {
  const row = { id: crypto.randomUUID(), competitor_id: competitorId, ...campaignToRow(campaign) };
  const saved = await write('competitor_campaigns', 'insert', { row });
  return campaignFromRow(saved);
}
export async function removeCampaign(id) {
  await write('competitor_campaigns', 'delete', { match: { id } });
}
