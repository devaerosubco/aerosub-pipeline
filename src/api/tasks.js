// Plan / tasks (PRD §6.11). A general (non-account) task has company_id
// NULL; deleting a company deletes its tasks (DB cascade).
import { write } from '../api.js';
import { taskFromRow } from '../store.js';

function toRow(t) {
  return {
    title: t.title,
    company_id: t.companyId || null,
    due: t.due || null,
    priority: t.priority || 'medium',
    done: !!t.done,
  };
}

export async function create(task) {
  const row = { id: task.id || crypto.randomUUID(), ...toRow(task) };
  const saved = await write('tasks', 'insert', { row });
  return taskFromRow(saved);
}

export async function update(id, patch) {
  const row = {};
  if ('title' in patch) row.title = patch.title;
  if ('companyId' in patch) row.company_id = patch.companyId || null;
  if ('due' in patch) row.due = patch.due || null;
  if ('priority' in patch) row.priority = patch.priority;
  if ('done' in patch) row.done = !!patch.done;
  const saved = await write('tasks', 'update', { row, match: { id } });
  return taskFromRow(saved);
}

export async function toggleDone(id, done) {
  const saved = await write('tasks', 'update', { row: { done: !!done }, match: { id } });
  return taskFromRow(saved);
}

export async function remove(id) {
  await write('tasks', 'delete', { match: { id } });
}
