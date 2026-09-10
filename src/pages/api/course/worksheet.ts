import type { APIRoute } from 'astro';
import { privateJson } from '../../../lib/server/auth';
import { requireEnrolled } from '../../../lib/server/course/enrollment';
import { getWorksheet } from '../../../lib/server/course/content';
import { WORKSHEET_ID_RE } from '../../../lib/course/ids';

export const prerender = false;

/** A module worksheet's markdown, for enrolled learners. Printed from the browser; no PDF is stored. */
export const GET: APIRoute = async ({ request }) => {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!WORKSHEET_ID_RE.test(id)) return privateJson({ error: 'bad_request', field: 'id' }, 400);
  const auth = await requireEnrolled(request);
  if ('error' in auth) return privateJson({ error: auth.error, reason: auth.reason }, auth.status);
  const worksheet = await getWorksheet(id);
  if (!worksheet) return privateJson({ error: 'not_found' }, 404);
  return privateJson({ id: worksheet.id, title: worksheet.title, module_id: worksheet.module, markdown: worksheet.body });
};
