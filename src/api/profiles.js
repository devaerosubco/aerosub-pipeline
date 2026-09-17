// Member roles (V2 Phase 0). Reading the team list stays in auth.js
// (listProfiles/myProfile) — this module only owns the one admin-gated
// write. RLS + the profiles column-lock trigger are the real enforcement;
// this is just a thin call, same as every other api/*.js module.
import { write } from '../api.js';

export async function setRole(id, role) {
  await write('profiles', 'update', { row: { role }, match: { id } });
}
