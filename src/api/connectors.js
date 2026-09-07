// Connectors — the Settings reference list of external systems (PRD §6.16).
// Documentation only; no live integrations.
import { write } from '../api.js';
import { connectorToRow, connectorFromRow } from '../store.js';

export async function create(connector) {
  const row = { id: connector.id || crypto.randomUUID(), ...connectorToRow(connector) };
  const saved = await write('connectors', 'insert', { row });
  return connectorFromRow(saved);
}

export async function remove(id) {
  await write('connectors', 'delete', { match: { id } });
}
