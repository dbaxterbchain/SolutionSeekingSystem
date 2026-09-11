# Paid video course (Phase 1)

The purchase, the learner area, and the assessed certification path. Phase 1 was built across
five sub-plans, 1a to 1e; the shots below come from the four that produced something to look at,
because 1a built the content collections, the catalog validator and the pure rule modules, which
are proved by `npm test` rather than by a screenshot. Verified end to end in a real browser
against the local Supabase stack: a real Stripe test-mode purchase, real autosaves, and two real
grades from `claude-opus-5`. See [../../roadmap.md](../../roadmap.md) Phase 6 for the plan and
[../../status.md](../../status.md) for what remains.

The public pages were captured with `PUBLIC_COURSE_STATUS=preview`, because production stays
`hidden` through the pilots. That is why the sales page and the pricing panel say "Opens soon"
rather than carrying a price.

| Screenshot | What it shows |
|---|---|
| ![Sales page, desktop](course-sales-preview-1280.png) | **`course-sales-preview-1280.png`**: the `/course` sales page in preview mode, with the syllabus built from the catalog, the certification section, and a CTA reading "Opens soon" instead of a price. That last part is what proves the launch flag gates the offer itself, not only the wording. |
| ![Sales page, phone](course-sales-preview-390.png) | **`course-sales-preview-390.png`**: `/course` at 390px. The hero, the first CTA and the syllabus stack into one column, so a phone visitor reaches the offer and the lesson list without a sideways scroll. |
| ![Dashboard, not enrolled](course-dashboard-buy-state-1280.png) | **`course-dashboard-buy-state-1280.png`**: `/course/learn` for a signed-in account with no enrollment. No lesson content is present, only the invitation to buy, and because the page is a shell there is nothing in the source either. |
| ![Dashboard, enrolled](course-dashboard-ready-1280.png) | **`course-dashboard-ready-1280.png`**: `/course/learn` after a completed purchase. The enrollment is recognised through `/api/course/entitlement` and the module list, progress and worksheets appear. |
| ![Dashboard resume pointer](course-dashboard-start-here-1280.png) | **`course-dashboard-start-here-1280.png`**: the derived resume pointer. "Start here" lands on the first lesson the learner has not finished, rather than on a stored bookmark that could go stale. |
| ![Lesson at phone width](course-lesson-390.png) | **`course-lesson-390.png`**: a lesson at 390px. The Cloudflare Stream player on a signed token, the sections drawer and the practice editor are all usable on a phone. |
| ![Lesson completed](course-lesson-complete-1280.png) | **`course-lesson-complete-1280.png`**: a lesson the learner has explicitly completed. The model response is revealed, the self-review is visible, the completion is recorded, and the next lesson is linked. |
| ![Worksheet print view](course-worksheet-print-1280.png) | **`course-worksheet-print-1280.png`**: the print view of a module worksheet, with the site chrome dropped and writing room under each prompt. The printable worksheet is a stylesheet, never a generated PDF. |
| ![Worksheet at phone width](course-worksheet-390.png) | **`course-worksheet-390.png`**: that worksheet on screen rather than on paper, at 390px. Each prompt keeps its writing space and stays readable at a phone's default text size, so the module can be worked through on the device it is read on. |
| ![Assessment part B](assessment-part-b-open-1280.png) | **`assessment-part-b-open-1280.png`**: the assessment once Part A has locked. Part B's reveal is visible and the Part A answers are read-only, which is the whole point of the staging: a reveal can only follow a stage that locks. |
| ![Assessment part B, phone](assessment-part-b-open-390.png) | **`assessment-part-b-open-390.png`**: Part B at 390px. The reveal, the live prompt and the locked Part A answers all sit in one column, so nothing a learner must read before answering ends up off-screen. |
| ![Grading in progress](assessment-grading-in-progress-1280.png) | **`assessment-grading-in-progress-1280.png`**: just after submitting. The attempt is frozen, the job is queued for the background worker, and the island polls for the result. Nothing is editable while a grade is in flight. |
| ![Passed result](assessment-result-passed-1280.png) | **`assessment-result-passed-1280.png`**: a real pass from `claude-opus-5`. Per-criterion scores against the published rubric, each carrying a quote copied verbatim from the learner's own response, and revision lessons drawn only from the form's allowed list. |
| ![Passed result, phone](assessment-result-passed-390.png) | **`assessment-result-passed-390.png`**: that result at 390px. Every criterion keeps its score, its reason and the quote it rests on, which matters because a phone is where most people will read a grade. |
| ![Grading error](assessment-grading-error-1280.png) | **`assessment-grading-error-1280.png`**: the grading-error panel. It leads with course support and says plainly that this is not a failed attempt, because a failure in our infrastructure must never read as a verdict on the learner. |
| ![Grading error on the dashboard](dashboard-certification-card-grading-error-1280.png) | **`dashboard-certification-card-grading-error-1280.png`**: that state as the dashboard's certification card carries it, so somebody who navigated away from the assessment still finds out what happened. |
| ![Admin grading queue](admin-grading-queue-1280.png) | **`admin-grading-queue-1280.png`**: `/admin` → Grading. Every job with its state, attempt count and lease, plus Retry (re-queue a failed job with a fresh budget) and Kick (re-trigger the worker without waiting for the sweeper). |
| ![Admin enrollments](admin-enrollments-1280.png) | **`admin-enrollments-1280.png`**: `/admin` → Enrollments. Every enrollment with its status and source, and the grant, revoke, record-refund and reinstate actions. Each writes a ledger row naming the admin who did it. |
| ![Access ended](dashboard-access-ended-1280.png) | **`dashboard-access-ended-1280.png`**: the learner dashboard immediately after a revoke. "Access to the course has ended for this account", no lesson content, matching the 403 every course endpoint now answers. |
| ![Account menu, enrolled](account-menu-my-course-1280.png) | **`account-menu-my-course-1280.png`**: the account menu for an enrolled account, offering "My course" into `/course/learn` from the shared per-user entitlement fetch. |
| ![Account menu, not enrolled](account-menu-explore-course-1280.png) | **`account-menu-explore-course-1280.png`**: that menu for an account with no enrollment, offering "Explore the course" into the sales page instead. One entry, never both. |
| ![Home course section](home-course-section-1280.png) | **`home-course-section-1280.png`**: the home page's course section, whose lesson and module figures come from the catalog at build time rather than being typed. It renders nothing at all while the course is hidden. |
| ![Pricing course panel](pricing-course-panel-1280.png) | **`pricing-course-panel-1280.png`**: the one-time course panel on `/pricing`, between the subscription plans and Teams, in preview mode so it reads "Opens soon". |
| ![Certification page](certification-page-1280.png) | **`certification-page-1280.png`**: `/course/certification`. The criteria and their weights are rendered from `src/data/certification.ts`, the same file the grader reads, so the published rubric and the grade cannot disagree. |
| ![Certification page, phone](certification-page-390.png) | **`certification-page-390.png`**: the rubric at 390px. The criteria table scrolls inside its own box rather than pushing the page sideways, so the weights stay legible next to the criterion they belong to. |

_Captured with a headless Chromium session against the local Supabase stack. The dark pill at
the bottom of some shots is the Astro dev toolbar, not part of the feature._
