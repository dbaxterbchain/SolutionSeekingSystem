import { useEffect, useMemo, useState } from 'react';
import SaveButton from './SaveButton';
import { useDialog } from './Dialog';
import { useLoadSaved } from '../../lib/useLoadSaved';

/**
 * Conversation Planner — prepares a Mutual Understanding (Step 2) conversation:
 * a setup checklist, goals, opening lines, a selectable question bank, and
 * active-listening reminders. Builds a copyable plan. Saves to localStorage.
 */

const STORAGE_KEY = 'sss-planner-v1';

const STAGE = [
  'Pick a private space, free from interruptions',
  'Agree on a specific time that works for you both',
  'Keep it one-on-one, don’t bring others',
  'Allow cooling-off time if tensions are high',
  'Consider offering food or drink',
];

const GOALS = [
  'To understand and be understood',
  'To help, not to hurt',
  'To fix the issue together',
];

const QUESTION_BANK = [
  'Can you help me understand how you felt and the way you see what happened?',
  'How did that make you feel?',
  'Do you think you felt that way because of…?',
  'Do you think that may be rooted in a fear that someone might see you as…?',
  'Is there anything about your perspective I might be missing?',
  'What would a good outcome look like for you?',
];

const LISTENING = [
  'Let them finish before I respond',
  'Reserve judgment; don’t lead with emotions',
  'Assume good faith',
  'Summarize what I hear to confirm understanding',
  'Set my own frustration aside and filter through empathy',
];

interface State {
  stage: string[];
  goals: string[];
  gratitude: string;
  intent: string;
  questions: string[];
  ownQuestions: string;
  listening: string[];
}

const EMPTY: State = {
  stage: [],
  goals: [],
  gratitude: '',
  intent: '',
  questions: [],
  ownQuestions: '',
  listening: [],
};

export default function ConversationPlanner() {
  const [state, setState] = useState<State>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const savedData = useLoadSaved();
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  // Hydrate from a saved session opened via ?load=<id> (overrides the draft).
  useEffect(() => {
    if (savedData) setState({ ...EMPTY, ...(savedData as Partial<State>) });
  }, [savedData]);

  const startOver = async () => {
    const ok = await confirm({
      title: 'Start over?',
      message: 'This clears your whole conversation plan. This can’t be undone.',
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (!ok) return;
    setState(EMPTY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  const toggle = (key: 'stage' | 'goals' | 'questions' | 'listening', value: string) =>
    setState((p) => ({
      ...p,
      [key]: p[key].includes(value)
        ? p[key].filter((v) => v !== value)
        : [...p[key], value],
    }));

  const setText = (key: 'gratitude' | 'intent' | 'ownQuestions', value: string) =>
    setState((p) => ({ ...p, [key]: value }));

  const summaryText = useMemo(() => {
    const own = state.ownQuestions
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const lines = [
      'SOLUTION SEEKING: CONVERSATION PLAN',
      '====================================',
      '',
      'SETTING THE STAGE',
      ...(state.stage.length ? state.stage.map((s) => `• ${s}`) : ['(none)']),
      '',
      'MY GOALS',
      ...(state.goals.length ? state.goals.map((g) => `• ${g}`) : ['(none)']),
      '',
      'HOW I’LL OPEN',
      `Gratitude: ${state.gratitude.trim() || '(none)'}`,
      `Intent: ${state.intent.trim() || '(none)'}`,
      '',
      'QUESTIONS TO ASK',
      ...([...state.questions, ...own].length
        ? [...state.questions, ...own].map((q) => `• ${q}`)
        : ['(none)']),
      '',
      'WHILE I LISTEN',
      ...(state.listening.length ? state.listening.map((l) => `• ${l}`) : ['(none)']),
    ];
    return lines.join('\n');
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const Check = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: () => void;
    label: string;
  }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 transition-colors hover:border-brand-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );

  return (
    <div className="space-y-8">
      {/* Set the stage */}
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
        <h2 className="font-heading text-xl font-bold text-ink-800">Set the stage</h2>
        <p className="mt-1 text-sm text-slate-600">
          Showing you’ve thought about them encourages good faith.
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {STAGE.map((s) => (
            <Check key={s} checked={state.stage.includes(s)} onChange={() => toggle('stage', s)} label={s} />
          ))}
        </div>
      </section>

      {/* Goals + opening */}
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
        <h2 className="font-heading text-xl font-bold text-ink-800">Your goals &amp; opening</h2>
        <p className="mt-1 text-sm text-slate-600">State your goals explicitly. Clarity is kindness.</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {GOALS.map((g) => (
            <Check key={g} checked={state.goals.includes(g)} onChange={() => toggle('goals', g)} label={g} />
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="gratitude" className="mb-1.5 block text-sm font-semibold text-ink-800">
              Open with gratitude
            </label>
            <textarea
              id="gratitude"
              rows={2}
              value={state.gratitude}
              onChange={(e) => setText('gratitude', e.target.value)}
              placeholder="e.g. “Thank you for agreeing to talk to me.”"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label htmlFor="intent" className="mb-1.5 block text-sm font-semibold text-ink-800">
              Be clear about your intent
            </label>
            <textarea
              id="intent"
              rows={2}
              value={state.intent}
              onChange={(e) => setText('intent', e.target.value)}
              placeholder="e.g. “I wanted to talk about a communication issue and find a good way to fix it.”"
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </section>

      {/* Question bank */}
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
        <h2 className="font-heading text-xl font-bold text-ink-800">Questions to ask</h2>
        <p className="mt-1 text-sm text-slate-600">
          Tap any to add them to your plan. The goal is to understand, not to win.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {QUESTION_BANK.map((q) => {
            const active = state.questions.includes(q);
            return (
              <button
                key={q}
                type="button"
                onClick={() => toggle('questions', q)}
                aria-pressed={active}
                className={`rounded-2xl border px-4 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'
                }`}
              >
                <span className="mr-1 font-semibold text-brand-500">{active ? '✓' : '+'}</span>
                {q}
              </button>
            );
          })}
        </div>
        <label htmlFor="ownQuestions" className="mt-5 block text-sm font-semibold text-ink-800">
          Your own questions (one per line)
        </label>
        <textarea
          id="ownQuestions"
          rows={3}
          value={state.ownQuestions}
          onChange={(e) => setText('ownQuestions', e.target.value)}
          placeholder="Add questions that fit your specific situation…"
          className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </section>

      {/* Listening */}
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
        <h2 className="font-heading text-xl font-bold text-ink-800">While I listen</h2>
        <p className="mt-1 text-sm text-slate-600">Reminders for the hardest part of the conversation.</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {LISTENING.map((l) => (
            <Check
              key={l}
              checked={state.listening.includes(l)}
              onChange={() => toggle('listening', l)}
              label={l}
            />
          ))}
        </div>
      </section>

      {/* Plan output */}
      <section className="rounded-3xl bg-ink-800 p-6 sm:p-8">
        <h2 className="font-heading text-xl font-bold text-white">Your conversation plan</h2>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/10 p-5 font-sans text-sm leading-relaxed text-brand-50">
          {summaryText}
        </pre>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={copy} className="btn bg-white text-ink-800 hover:bg-brand-50">
            {copied ? 'Copied ✓' : 'Copy the plan'}
          </button>
          <SaveButton
            tool="planner"
            data={() => ({ ...state })}
            summary={summaryText}
            defaultTitle={(state.intent || 'Conversation plan').trim().slice(0, 60)}
            className="btn border border-white/30 text-white hover:bg-white/10"
          />
          <a
            href="/protocol/mutual-understanding"
            className="btn border border-white/30 text-white hover:bg-white/10"
          >
            About this step
          </a>
          <button
            type="button"
            onClick={startOver}
            className="btn ml-auto text-white/60 hover:text-red-300"
          >
            Start over
          </button>
        </div>
      </section>
      {dialog}
    </div>
  );
}
