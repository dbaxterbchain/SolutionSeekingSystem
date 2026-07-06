import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

// Captured at module load: supabase-js consumes and CLEARS the URL hash while
// establishing the recovery session, and its PASSWORD_RECOVERY event can fire
// before the React island hydrates. Module evaluation is synchronous, so this
// read is guaranteed to happen first.
const urlRecovery =
  typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

// Expired or already-used links land with #error_code=otp_expired — surface it
// instead of silently showing the plain sign-in form.
const urlLinkError =
  typeof window !== 'undefined' &&
  /error_code=(otp_expired|access_denied)/.test(window.location.hash);

/** Recovery-flow state for the /account island. */
export function usePasswordRecovery() {
  const [recovering, setRecovering] = useState(urlRecovery);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    recovering,
    linkExpired: urlLinkError,
    finishRecovery: () => setRecovering(false),
  };
}
