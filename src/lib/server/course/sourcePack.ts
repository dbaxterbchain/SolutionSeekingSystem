import { createHash } from 'node:crypto';
import { methodologyMarkdown } from '../../llms';
import { supabaseAdmin } from '../supabaseAdmin';

/**
 * The methodology text the grader reads, stored once per content version
 * and referenced by id from every attempt, so grading never needs
 * astro:content. Astro-only. Memoised per process; dev re-reads.
 */
let cached: Promise<{ id: string; sha256: string }> | null = null;

export function ensureSourcePack(): Promise<{ id: string; sha256: string }> {
  if (cached && !import.meta.env.DEV) return cached;
  cached = load().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

async function load(): Promise<{ id: string; sha256: string }> {
  const body = await methodologyMarkdown();
  const sha256 = createHash('sha256').update(body).digest('hex');
  const existing = await supabaseAdmin.from('course_source_packs').select('id').eq('sha256', sha256).maybeSingle();
  if (existing.error) throw new Error(`source pack lookup failed: ${existing.error.message}`);
  if (existing.data) return { id: existing.data.id, sha256 };
  const inserted = await supabaseAdmin
    .from('course_source_packs')
    .insert({ sha256, kind: 'methodology', body, char_count: body.length })
    .select('id')
    .single();
  if (!inserted.error) return { id: inserted.data.id, sha256 };
  // A concurrent insert of the same text landed first: read it back.
  const again = await supabaseAdmin.from('course_source_packs').select('id').eq('sha256', sha256).maybeSingle();
  if (again.error || !again.data) throw new Error(`source pack insert failed: ${inserted.error.message}`);
  return { id: again.data.id, sha256 };
}
