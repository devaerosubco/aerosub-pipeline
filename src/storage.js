// Supabase Storage — the app's first use (V2 HT-B). One private bucket,
// `store-attachments`, for product datasheets (OEM products only) and
// product/service images. Private + member-gated (see the migration) so
// this doesn't quietly reintroduce the no-login share link deferred in
// PRD-v2 §0 — objects are read via a short-lived signed URL, never a public
// one, and the DB stores the object *path*, not a URL (a stored URL would
// go stale the moment it expired).
import { supabase } from './supabase.js';

const BUCKET = 'store-attachments';
const SIGNED_URL_TTL = 60 * 60; // 1 hour — plenty for one render pass; re-signed on next open

export async function uploadFile(file, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  });
  if (error) throw error;
  return path;
}

export async function signedUrl(path) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return '';
  return data?.signedUrl || '';
}

export async function removeFile(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

// Reads a stored object's text content (V2 HT-D — parsing/rendering an
// uploaded .html quote template). Same member-only RLS as everything else
// in this bucket; no signed URL needed since this goes straight through the
// authenticated client.
export async function downloadText(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return await data.text();
}

// Reads a stored object's binary content (.docx quote templates — item 2's
// deferred-then-built .docx support). Word's .docx is a zip, not text, so
// this returns an ArrayBuffer for pizzip to unpack.
export async function downloadArrayBuffer(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return await data.arrayBuffer();
}
