# Course Production

How a lesson gets from a recording to something an enrolled learner can watch. Written for
Bradley, who films and edits, and for David, who approves the copy and presses publish.

Every lesson is one video, one caption file, and one Markdown file in the repo. The Markdown
file is the record: it carries the lesson's copy, the id of the video in Cloudflare Stream, its
real length, and the stamps saying who signed off on what. If the Markdown file says a lesson is
ready and it is not, the site believes the Markdown file, so the stamps matter.

The authoring side of the same files (what goes in each section, what the frontmatter fields
mean) is in [content-guide.md](content-guide.md). The operator side (environment variables,
Stripe, the launch flag) is in [deployment.md](deployment.md#paid-video-course).

## Naming the files

**Name every file after the lesson id.** The ids are the plan's video numbers: `v01`, `v02`, and
so on, zero-padded to two digits. So lesson `v04` is:

```
v04.mp4      the edited master
v04.vtt      the English captions for that master
```

That is the whole convention, and it is worth being strict about it. The id is the lesson's URL,
the key on every learner's progress row, and the name of the file in the repo, so a video called
`module1-final-v2.mp4` is the one thing that cannot be checked automatically. If you are not
sure which id a recording belongs to, ask David rather than guessing: an id never changes once a
lesson is published, so a wrong one is expensive to undo.

## The media baseline

| | |
|---|---|
| Resolution | 1080p (1920x1080) |
| Aspect ratio | 16:9 |
| Container and video codec | MP4, H.264 |
| Audio | AAC, stereo |
| Captions | WebVTT, English, one `.vtt` per video |

Cloudflare Stream re-encodes and serves its own adaptive versions, so there is no need to make
smaller copies. Deliver the best single master you have that matches the table above.

Captions are a real part of the lesson, not an accessibility afterthought: a fair number of
learners will read rather than listen, and the lesson page offers the transcript beside the
video for exactly that reason. Correct the machine transcript before you upload it. Names,
the system's own terms (Introspection, Mutual Understanding, Solution Seeking, the Wisdom
Principles) and any on-screen text are the parts worth checking twice.

## Uploading a lesson to Cloudflare Stream

1. **Upload the MP4** to Cloudflare Stream.
2. **Turn "Require signed URLs" on.** Do this for every video with exactly one exception: the
   free preview lesson, which has to be watchable by a stranger with no account. David will tell
   you which lesson that is; it is named in [`src/data/course.ts`](../src/data/course.ts) as
   `previewLessonId`.
3. **Upload the VTT as the `en` caption track** on that same video, not as a separate asset.
4. **Copy the video's UID** (32 characters of lowercase hex) and put it in the lesson file's
   `streamUid`.
5. **Set `durationMin`** from the edited master, rounded to whole minutes. Until the master
   exists this field is a planning estimate; once it exists it should be the real length,
   because the learner dashboard adds these up to say how long a module takes.
6. **Add the approval stamps.** The format is a date and your initials, `YYYY-MM-DD INITIALS`,
   and the build rejects anything else:

   ```yaml
   approvals:
     copy: 2026-09-12 DB       # David, the lesson copy
     edit: 2026-10-02 BC       # Bradley, the edited master
     captions: 2026-10-03 BC   # Bradley, the corrected captions
   ```

You do not need to touch the poster image. The player uses the frame two seconds into the video
as its poster, fetched through the same signed token as the video itself, so a deliberate opening
frame two seconds in is the only thing that affects it.

## Who moves a lesson up each rung

The lesson's `status` field is a ladder, and each rung means "everything below this is done".
Move it one rung at a time, in the lesson file, and let the build check you.

| Rung | Whose move | What it means |
|---|---|---|
| `draft` | David | The copy is being written. |
| `approved` | David | The copy is final and stamped `approvals.copy`. This is the green light to film. |
| `filmed` | Bradley | The recording exists. Nothing is uploaded yet. |
| `edited` | Bradley | The master is cut, uploaded, signed, and its UID, `durationMin` and `approvals.edit` are in the lesson file. |
| `captioned` | Bradley | The corrected VTT is on the video, the transcript is in the lesson file, and `approvals.captions` is stamped. |
| `staged` | David | David previews the finished lesson through `/admin` before anyone else sees it. |
| `published` | David | Live for every enrolled learner. |

Publishing is always David's, and so is the copy approval at the bottom. Everything between them
is yours.

## The stand-in clip

While a lesson is written but not filmed, it plays a short "this lesson is being filmed" clip so
the learner area is never a broken page. It is rendered from the repo rather than recorded:

```bash
npm i --no-save playwright-core ffmpeg-static
node scripts/render-placeholder-video.mjs
```

That writes an MP4, a matching VTT and a poster frame into
`scripts/placeholder-video/out/`. Upload the MP4 to Stream **once**, with signed URLs on, add
its VTT as the `en` captions, and give David the UID: he puts it in
`COURSE.placeholderStreamUid` in [`src/data/course.ts`](../src/data/course.ts). One upload
covers every lesson that is waiting, because a lesson marked `videoPlaceholder: true` with no
video of its own plays whatever that setting points at.

**Swapping in the real recording is an ordinary lesson edit**, not a special case. In the lesson
file: set `streamUid` to the new video's UID, delete the `videoPlaceholder` line, and carry on
up the ladder from `edited`. Nothing else has to change, and no learner's progress is affected.

One rule the build enforces on your behalf: **a lesson still on the stand-in clip cannot be
staged or published once the course is open for sale.** If that stops a build, it has done its
job. Selling a lesson that turns out to be a placard is worse than a late launch.

## When the build stops

Everything above is checked when the site builds, and the checker is on your side: it lists
every problem it found at once, and it names the file and the rule for each one. So the first
move is always to read the whole message rather than the first line.

The messages look like this:

```
Course content validation failed (2):
- Lesson v04 (edited): streamUid is required
- Lesson v07: Expected exactly these "##" headings, in this order: Outcome | Key points |
  Exercise | Model response | Self-review | Transcript. Found: Outcome | Key points | Exercise
```

Read that as "v04 says it is `edited` but has no video uid" and "v07 is missing its last three
sections". The pattern holds generally: the rung in brackets is the claim the file is making, and
the sentence after it is the thing that claim requires.

Two failures that are worth recognising by sight:

- **A dash in the copy.** `no em dashes, en dashes, or {{tokens}}` means the title or the body
  has an em dash, an en dash, or a `{{token}}` that was never filled in. Rewrite the sentence
  rather than swapping the dash for a comma: a page of comma splices reads worse than the dash
  did. The house rules are in [content-guide.md](content-guide.md).
- **A broken chain.** `Lesson chain position 5 should be v05 (found v06)` means somebody's `next`
  field points past a lesson. The order of the course is that chain, so a typo there would
  silently reorder lessons if the build did not catch it.

If a message does not make sense, send it to David with the lesson id. It is a repo problem, not
something to work around by changing the status back.
