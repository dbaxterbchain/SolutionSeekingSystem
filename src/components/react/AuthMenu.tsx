import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';

/**
 * Header account control. Signed out → a "Sign in" link to /account. Signed in →
 * the user's email with a dropdown to reach the account page or sign out.
 * `variant="mobile"` renders inline (stacked) for the mobile menu.
 *
 * An ANONYMOUS trial user reads as signed out here, on purpose. They have a real
 * `auth.users` row (that is what makes "3 messages, no account" work), but they
 * do not have an account in any sense they would recognise: no email, nothing to
 * sign back into, and nothing to manage. Treating them as signed in produced the
 * bug this comment exists for, an avatar bubble with no letter in it, and would
 * have offered them "Sign out", which silently destroys the conversation they are
 * in the middle of. "Sign in" is both the honest label and the action we want:
 * registering from /account converts them in place and keeps the conversation.
 */
export default function AuthMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    setOpen(false);
    window.location.href = '/';
  };

  // Avoid a flash of the wrong state during the first auth check.
  if (loading) {
    return <span className="text-sm text-slate-400" aria-hidden="true">…</span>;
  }

  if (!user || user.is_anonymous) {
    if (variant === 'mobile') {
      return (
        <a
          href="/account"
          className="rounded-xl px-4 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Sign in
        </a>
      );
    }
    return (
      <a
        href="/account"
        className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-ink-800"
      >
        Sign in
      </a>
    );
  }

  // `||`, not `??`: Supabase gives an emailless user an EMPTY STRING, which `??`
  // happily passes through and `.charAt(0)` turns into a blank avatar bubble.
  const email = user.email?.trim() || 'Account';
  const initial = email.charAt(0).toUpperCase();

  if (variant === 'mobile') {
    return (
      <div className="flex flex-col gap-1">
        <span className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {email}
        </span>
        <a
          href="/account"
          className="rounded-xl px-4 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          My account
        </a>
        <button
          type="button"
          onClick={signOut}
          className="rounded-xl px-4 py-3 text-left text-base font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${email}`}
        title={email}
        className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-ink-800"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
          {initial}
        </span>
        <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-card-hover"
          >
            <span className="block truncate px-4 py-2 text-xs text-slate-400">{email}</span>
            <a
              href="/account"
              role="menuitem"
              className="block px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              My account
            </a>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-red-600"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
