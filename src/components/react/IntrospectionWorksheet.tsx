import { useEffect, useMemo, useState } from 'react';
import SaveButton from './SaveButton';
import { useDialog } from './Dialog';
import { useLoadSaved } from '../../lib/useLoadSaved';

/**
 * Guided Introspection Worksheet — a React island that walks a user through the
 * 7-step Introspection process (Communication Protocol, Step 1), auto-saves to
 * localStorage, and produces a copyable "conversation prep" summary.
 */

const STORAGE_KEY = 'sss-introspection-v1';

interface PrincipleRef {
  label: string;
  slug: string;
}

interface Field {
  id: string;
  label: string;
  placeholder: string;
}

interface Step {
  eyebrow: string;
  title: string;
  intro: string;
  principles?: PrincipleRef[];
  examples?: string[];
  emotionPicker?: boolean;
  fields: Field[];
}

const EMOTIONS = [
  'Frustration',
  'Anger',
  'Fear',
  'Embarrassment',
  'Shame',
  'Sadness',
  'Hurt',
  'Anxiety',
];

const STEPS: Step[] = [
  {
    eyebrow: 'Step 1',
    title: 'Your perspective',
    intro:
      'Recount what happened as you currently see it. Don’t worry about being fair yet, just capture your honest, first-person view of the situation.',
    fields: [
      {
        id: 'situation',
        label: 'What happened?',
        placeholder:
          'e.g. "Brian snapped at me and didn’t let me finish when I tried to tell him…"',
      },
    ],
  },
  {
    eyebrow: 'Step 2',
    title: 'Your first impression',
    intro:
      'What is the clearest emotion you’re feeling right now? Emotions are notifications, not the problem itself. Name them so you can look past them.',
    emotionPicker: true,
    fields: [
      {
        id: 'firstEmotion',
        label: 'Describe that first reaction',
        placeholder: 'e.g. "I was angry; it felt like he was lashing out at me."',
      },
    ],
  },
  {
    eyebrow: 'Step 3',
    title: 'Dig deeper',
    intro:
      'Now examine that first impression and figure out WHY you feel this way. This is where you use Forgiveness. Allow yourself to move past the discomfort so you can understand it.',
    principles: [{ label: 'Forgiveness', slug: 'forgiveness' }],
    fields: [
      {
        id: 'whyFeel',
        label: 'Why do you feel this way?',
        placeholder:
          'e.g. "I was trying to help, but it felt like my effort was unwelcome…"',
      },
    ],
  },
  {
    eyebrow: 'Step 4',
    title: 'Name your feelings',
    intro:
      'What underlying feelings, experiences, or motivations added up to that initial emotion? Try to name them specifically.',
    fields: [
      {
        id: 'underlyingFeelings',
        label: 'What’s underneath the first reaction?',
        placeholder:
          'e.g. "I wanted to be appreciated. I felt tension and a fear of being misjudged…"',
      },
    ],
  },
  {
    eyebrow: 'Step 5',
    title: 'Ask more questions',
    intro:
      'Keep asking yourself questions until you understand how you felt and why. This is where Critical Thinking helps. Capture whatever comes up.',
    principles: [{ label: 'Critical Thinking', slug: 'critical-thinking' }],
    examples: [
      'Why does that hurt?',
      'Was it anger that I saw, and why did they feel that way?',
      'What is the tension I feel?',
      'Why does that matter to me?',
    ],
    fields: [
      {
        id: 'moreQuestions',
        label: 'Questions you asked yourself, and what surfaced',
        placeholder: 'Write the questions and the answers you found…',
      },
    ],
  },
  {
    eyebrow: 'Step 6',
    title: 'Explore with compassion',
    intro:
      'Now think about them. Put yourself in their shoes with Empathy and Compassion. They’re a human with a past, fears, and good and bad days. Remember: their perspective is unknowable until you ask.',
    principles: [{ label: 'Compassion & Empathy', slug: 'compassion-empathy' }],
    examples: [
      'Is it possible there’s something else going on that made them act that way?',
      'Could I have misunderstood them?',
      'What could compel me to act the way they did?',
      'Could I have done something differently that would have had a better outcome?',
    ],
    fields: [
      {
        id: 'theirPerspective',
        label: 'What might they be feeling or fearing?',
        placeholder:
          'e.g. "Maybe it wasn’t anger but insecurity about doing it wrong…"',
      },
    ],
  },
  {
    eyebrow: 'Step 7',
    title: 'Prepare for the conversation',
    intro:
      'Pull your introspection into a plan for the Mutual Understanding step. Clarity is kindness. The clearer you are about your feelings and intentions, the better they can understand you.',
    principles: [{ label: 'Mutual Understanding', slug: '' }],
    fields: [
      {
        id: 'questionsToAsk',
        label: 'What do you want to ask them?',
        placeholder: 'Good questions that could create clarity for both of you…',
      },
      {
        id: 'goals',
        label: 'What are your goals for the conversation?',
        placeholder: 'e.g. "To understand and be understood, and to repair trust."',
      },
      {
        id: 'clearerExpression',
        label: 'How can you express yourself clearly?',
        placeholder: 'How you’ll explain your actions, intentions, and feelings…',
      },
      {
        id: 'avoidFuture',
        label: 'How might you avoid this problem in the future?',
        placeholder: 'Any patterns, habits, or agreements that could help…',
      },
    ],
  },
];

const SUMMARY_INDEX = STEPS.length;

type Answers = Record<string, string>;

function buildSummaryText(answers: Answers, emotions: string[]): string {
  const lines: string[] = [
    'SOLUTION SEEKING: INTROSPECTION PREP',
    '====================================',
    '',
    'THE SITUATION (my perspective)',
    answers.situation?.trim() || '(none)',
    '',
    'MY FIRST REACTION',
    [emotions.join(', '), answers.firstEmotion?.trim()].filter(Boolean).join(' / ') || '(none)',
    '',
    'WHY I FELT THAT WAY',
    answers.whyFeel?.trim() || '(none)',
    '',
    'WHAT WAS UNDERNEATH IT',
    answers.underlyingFeelings?.trim() || '(none)',
    '',
    'QUESTIONS I ASKED MYSELF',
    answers.moreQuestions?.trim() || '(none)',
    '',
    'THEIR PERSPECTIVE (with compassion)',
    answers.theirPerspective?.trim() || '(none)',
    '',
    'MY PLAN FOR THE CONVERSATION',
    '------------------------------',
    '',
    'Questions to ask them:',
    answers.questionsToAsk?.trim() || '(none)',
    '',
    'My goals:',
    answers.goals?.trim() || '(none)',
    '',
    'How I’ll express myself clearly:',
    answers.clearerExpression?.trim() || '(none)',
    '',
    'How we might avoid this in future:',
    answers.avoidFuture?.trim() || '(none)',
  ];
  return lines.join('\n');
}

export default function IntrospectionWorksheet() {
  const [answers, setAnswers] = useState<Answers>({});
  const [emotions, setEmotions] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const savedData = useLoadSaved();
  const { confirm, dialog } = useDialog();

  // Load saved progress once on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.answers && typeof data.answers === 'object') setAnswers(data.answers);
        if (Array.isArray(data.emotions)) setEmotions(data.emotions);
        if (typeof data.current === 'number') {
          setCurrent(Math.max(0, Math.min(SUMMARY_INDEX, data.current)));
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  // Hydrate from a saved session opened via ?load=<id>, jumping to the summary.
  useEffect(() => {
    if (!savedData) return;
    if (savedData.answers && typeof savedData.answers === 'object') {
      setAnswers(savedData.answers as Answers);
    }
    if (Array.isArray(savedData.emotions)) setEmotions(savedData.emotions as string[]);
    setCurrent(SUMMARY_INDEX);
  }, [savedData]);

  // Persist on change.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, emotions, current }));
    } catch {
      /* storage may be unavailable */
    }
  }, [answers, emotions, current, loaded]);

  const completedCount = useMemo(
    () =>
      STEPS.filter((step) =>
        step.fields.some((f) => (answers[f.id] || '').trim().length > 0)
      ).length,
    [answers]
  );

  const setField = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const toggleEmotion = (emotion: string) =>
    setEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );

  const goTo = (index: number) => {
    setCurrent(index);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startOver = async () => {
    const ok = await confirm({
      title: 'Start over?',
      message: 'This clears every step of your introspection. This can’t be undone.',
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (!ok) return;
    setAnswers({});
    setEmotions([]);
    setCurrent(0);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const summaryText = useMemo(
    () => buildSummaryText(answers, emotions),
    [answers, emotions]
  );

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const downloadSummary = () => {
    const blob = new Blob([summaryText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'introspection-prep.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSummary = current >= SUMMARY_INDEX;
  const progress = Math.round((Math.min(current, SUMMARY_INDEX) / SUMMARY_INDEX) * 100);

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-800">
            {onSummary ? 'Your prep summary' : `${STEPS[current].eyebrow} of ${STEPS.length}`}
          </span>
          <span className="text-slate-500">{completedCount}/{STEPS.length} steps filled in</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {!onSummary ? (
        <div>
          <p className="eyebrow mb-2">{STEPS[current].eyebrow}</p>
          <h2 className="font-heading text-2xl font-bold text-ink-800">
            {STEPS[current].title}
          </h2>
          <p className="mt-3 leading-relaxed text-slate-600">{STEPS[current].intro}</p>

          {STEPS[current].principles && (
            <div className="mt-4 flex flex-wrap gap-2">
              {STEPS[current].principles!.map((p) =>
                p.slug ? (
                  <a
                    key={p.label}
                    href={`/principles/${p.slug}`}
                    className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    {p.label} →
                  </a>
                ) : (
                  <span
                    key={p.label}
                    className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"
                  >
                    {p.label}
                  </span>
                )
              )}
            </div>
          )}

          {STEPS[current].examples && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prompts to consider
              </p>
              <ul className="mt-2 space-y-1.5 text-sm italic text-slate-600">
                {STEPS[current].examples!.map((ex) => (
                  <li key={ex}>“{ex}”</li>
                ))}
              </ul>
            </div>
          )}

          {STEPS[current].emotionPicker && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-ink-800">Tap any that fit</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EMOTIONS.map((emotion) => {
                  const active = emotions.includes(emotion);
                  return (
                    <button
                      key={emotion}
                      type="button"
                      onClick={() => toggleEmotion(emotion)}
                      aria-pressed={active}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      {emotion}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {STEPS[current].fields.map((field) => (
              <div key={field.id}>
                <label
                  htmlFor={field.id}
                  className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                  {field.label}
                </label>
                <textarea
                  id={field.id}
                  value={answers[field.id] || ''}
                  onChange={(e) => setField(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            ))}
          </div>

          {/* Nav */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goTo(Math.max(0, current - 1))}
              disabled={current === 0}
              className="btn-ghost px-4 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Back
            </button>
            <span className="text-xs text-slate-400">Saved automatically</span>
            <button type="button" onClick={() => goTo(current + 1)} className="btn-primary">
              {current === STEPS.length - 1 ? 'See my summary' : 'Next'} →
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="font-heading text-2xl font-bold text-ink-800">
            You’re ready for the conversation
          </h2>
          <p className="mt-3 leading-relaxed text-slate-600">
            Here’s your introspection, pulled together. Copy or download it to bring into
            your <a href="/protocol/mutual-understanding" className="font-medium text-brand-600 underline decoration-brand-200 underline-offset-2">Mutual Understanding</a> conversation.
          </p>

          <pre className="mt-6 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 font-sans text-sm leading-relaxed text-slate-700">
            {summaryText}
          </pre>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={copySummary} className="btn-primary">
              {copied ? 'Copied ✓' : 'Copy to clipboard'}
            </button>
            <button type="button" onClick={downloadSummary} className="btn-secondary">
              Download .txt
            </button>
            <SaveButton
              tool="introspection"
              data={() => ({ answers, emotions })}
              summary={summaryText}
              defaultTitle={(answers.situation || 'Introspection').trim().slice(0, 60)}
              className="btn-secondary"
            />
            <button type="button" onClick={() => goTo(0)} className="btn-ghost">
              Review answers
            </button>
            <button
              type="button"
              onClick={startOver}
              className="btn-ghost ml-auto text-slate-400 hover:text-red-600"
            >
              Start over
            </button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  );
}
