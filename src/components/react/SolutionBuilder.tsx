import { useEffect, useMemo, useState } from 'react';
import SaveButton from './SaveButton';
import { useDialog } from './Dialog';
import { useLoadSaved } from '../../lib/useLoadSaved';

/**
 * Solution Builder — checks a drafted solution against the four marks of a good
 * solution (Actionable, Testable, Effective, Time-bound) plus an equity check,
 * with live scoring. Saves to localStorage.
 */

const STORAGE_KEY = 'sss-solution-v1';

interface Criterion {
  id: string;
  name: string;
  prompt: string;
  placeholder: string;
}

const CRITERIA: Criterion[] = [
  {
    id: 'actionable',
    name: 'Actionable',
    prompt: 'What specific steps will be taken?',
    placeholder: 'e.g. "Add a shared calendar and do a 5-minute check-in each shift."',
  },
  {
    id: 'testable',
    name: 'Testable',
    prompt: 'What will you measure to know it’s working?',
    placeholder: 'e.g. "No more double-booked shifts over the next two weeks."',
  },
  {
    id: 'effective',
    name: 'Effective',
    prompt: 'How does this directly address the actual problem?',
    placeholder: 'e.g. "It removes the scheduling confusion that caused the conflict."',
  },
  {
    id: 'timebound',
    name: 'Time-bound',
    prompt: 'What’s the timeframe to try it and review?',
    placeholder: 'e.g. "Try for two weeks, then review together on the 15th."',
  },
];

type State = Record<string, string>;

export default function SolutionBuilder() {
  const [values, setValues] = useState<State>({});
  const [equity, setEquity] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const savedData = useLoadSaved();
  const { confirm, dialog } = useDialog();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.values) setValues(data.values);
        if (typeof data.equity === 'boolean') setEquity(data.equity);
      }
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  // Hydrate from a saved session opened via ?load=<id> (overrides the draft).
  useEffect(() => {
    if (!savedData) return;
    if (savedData.values && typeof savedData.values === 'object') {
      setValues(savedData.values as State);
    }
    if (typeof savedData.equity === 'boolean') setEquity(savedData.equity);
  }, [savedData]);

  const startOver = async () => {
    const ok = await confirm({
      title: 'Start over?',
      message: 'This clears your solution and all four marks. This can’t be undone.',
      confirmLabel: 'Start over',
      tone: 'danger',
    });
    if (!ok) return;
    setValues({});
    setEquity(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ values, equity }));
    } catch {
      /* ignore */
    }
  }, [values, equity, loaded]);

  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  const metCount = useMemo(
    () => CRITERIA.filter((c) => (values[c.id] || '').trim().length > 0).length,
    [values]
  );

  const verdict = useMemo(() => {
    if (!(values.solution || '').trim()) return 'Describe your solution to begin.';
    if (metCount === CRITERIA.length)
      return equity
        ? 'Strong solution: actionable, measurable, and fair to everyone. Ready to try.'
        : 'Specific and measurable. Confirm it feels fair to everyone before committing.';
    if (metCount >= 2) return 'Getting there. Fill in the remaining marks to strengthen it.';
    return 'Early draft. Work through each mark below.';
  }, [values, metCount, equity]);

  const summaryText = useMemo(() => {
    const lines = [
      'SOLUTION SEEKING: SOLUTION CHECK',
      '=================================',
      '',
      'THE SOLUTION',
      (values.solution || '').trim() || '(none)',
      '',
      ...CRITERIA.flatMap((c) => [
        `${c.name.toUpperCase()}: ${c.prompt}`,
        (values[c.id] || '').trim() || '(none)',
        '',
      ]),
      `EQUITABLE FOR ALL PARTIES? ${equity ? 'Yes' : 'Not yet confirmed'}`,
    ];
    return lines.join('\n');
  }, [values, equity]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">
      {/* Solution statement */}
      <label htmlFor="solution" className="block text-sm font-semibold text-ink-800">
        The solution you’re considering
      </label>
      <textarea
        id="solution"
        rows={3}
        value={values.solution || ''}
        onChange={(e) => set('solution', e.target.value)}
        placeholder="Describe the plan, pattern, or tool you and the other person are considering…"
        className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {/* Live verdict */}
      <div className="mt-5 rounded-2xl bg-brand-50/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink-800">{verdict}</span>
          <span className="shrink-0 text-sm font-bold text-brand-600">{metCount}/4</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {CRITERIA.map((c) => (
            <div
              key={c.id}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                (values[c.id] || '').trim() ? 'bg-brand-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Criteria */}
      <div className="mt-6 space-y-4">
        {CRITERIA.map((c) => {
          const met = (values[c.id] || '').trim().length > 0;
          return (
            <div
              key={c.id}
              className={`rounded-2xl border p-5 transition-colors ${
                met ? 'border-brand-200 bg-white' : 'border-slate-100 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs text-white ${
                    met ? 'bg-brand-500' : 'bg-slate-300'
                  }`}
                  aria-hidden="true"
                >
                  {met ? '✓' : ''}
                </span>
                <h3 className="font-bold text-ink-800">{c.name}</h3>
              </div>
              <label htmlFor={c.id} className="mt-2 block text-sm text-slate-600">
                {c.prompt}
              </label>
              <textarea
                id={c.id}
                rows={2}
                value={values[c.id] || ''}
                onChange={(e) => set(c.id, e.target.value)}
                placeholder={c.placeholder}
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          );
        })}
      </div>

      {/* Equity check */}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
        <input
          type="checkbox"
          checked={equity}
          onChange={(e) => setEquity(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
        />
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-ink-800">This feels fair to everyone involved.</span>{' '}
          If it only benefits one party, it isn’t finished yet. Some discomfort can be
          part of growth, but a solution should feel fair to all.
        </span>
      </label>

      {/* Solution check output */}
      <section className="mt-6 rounded-3xl bg-ink-800 p-6 sm:p-8">
        <h2 className="font-heading text-xl font-bold text-white">Your solution check</h2>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-white/10 p-5 font-sans text-sm leading-relaxed text-brand-50">
          {summaryText}
        </pre>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/* Gold, on the one action that matters, at the moment the tool hands
              back a result. 8.66:1 against ink-800; see /design. */}
          <button type="button" onClick={copy} className="btn bg-gold-500 text-ink-800 hover:bg-gold-400">
            {copied ? 'Copied ✓' : 'Copy the check'}
          </button>
          <SaveButton
            tool="solution"
            data={() => ({ values, equity })}
            summary={summaryText}
            defaultTitle={(values.solution || 'Solution check').trim().slice(0, 60)}
            className="btn border border-white/30 text-white hover:bg-white/10"
          />
          <a
            href="/protocol/solution-seeking"
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
