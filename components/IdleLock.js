'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const IDLE_MS = 5 * 60 * 1000;

// The cookie already expires after five idle minutes, but nothing forces a
// request while you sit on the page — and the roster talks straight to
// Supabase, not to us. So the tab watches itself and locks on its own.
export default function IdleLock() {
  const router = useRouter();
  const timer = useRef(null);

  useEffect(() => {
    let done = false;

    async function lock() {
      if (done) return;
      done = true;
      try {
        // say why, so the log can tell walking away from signing out
        await fetch('/api/lock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'idle' }),
        });
      } catch {
        /* locking anyway */
      }
      router.replace('/lock');
      router.refresh();
    }

    function reset() {
      if (done) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(lock, IDLE_MS);
    }

    // coming back to a tab that sat in the background counts as being away
    function onVisible() {
      if (document.visibilityState === 'visible') reset();
    }

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focus'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    reset();

    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  return null;
}
