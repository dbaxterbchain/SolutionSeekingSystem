import type { APIRoute } from 'astro';
import { getUserFromRequest, privateJson } from '../../../lib/server/auth';
import { isAdminUser } from '../../../lib/server/adminAuth';
import { getCourseEntitlement } from '../../../lib/server/course/enrollment';
import { canPurchase } from '../../../lib/server/course/enrollmentRules';
import { COURSE_STATUS } from '../../../data/course';

export const prerender = false;

/**
 * Whether this user has the course, according to the server, plus whether
 * checkout would sell it to them right now. The browser never reads the
 * course tables (they have no client grants), so this is the only way an
 * island learns either fact. Never cached.
 */
export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) return privateJson({ error: 'unauthorized' }, 401);

  const entitlement = await getCourseEntitlement(user);
  // Admins may buy before launch (that is how the pilot tests checkout), so the
  // answer depends on who is asking. Only consulted while the course is not open.
  const isAdmin = COURSE_STATUS !== 'open' && isAdminUser(user);

  return privateJson({
    ...entitlement,
    sale: {
      status: COURSE_STATUS,
      can_purchase: canPurchase(entitlement, {
        status: COURSE_STATUS,
        isAdmin,
        isAnonymous: user.is_anonymous === true,
      }),
    },
  });
};
