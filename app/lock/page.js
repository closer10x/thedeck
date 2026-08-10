'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Delete } from 'lucide-react';
import Mark from '../../components/Mark';

const C = {
  canvas: 'var(--canvas)',
  surface: 'var(--surface)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
  line: 'var(--line)',
  accent: 'var(--accent)',
  bad: 'var(--bad)',
};

const LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'del'];

export default function LockPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [state, setState] = useState('idle'); // idle | checking | wrong | ok
  // the PIN says who you are, so the pad can greet you before it lets you in
  const [name, setName] = useState('');

  const submit = useCallback(
    async (value) => {
      setState('checking');
      try {
        const r = await fetch('/api/unlock', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ attempt: value }),
        });
        if (r.ok) {
          const out = await r.json().catch(() => ({}));
          if (out.name) setName(out.name);
          setState('ok');
          // Long enough to actually read your name. The dots finish filling and
          // glowing at ~470ms, and the greeting rises in after that — at 700ms
          // the whole thing was over before it registered.
          setTimeout(() => {
            router.replace('/');
            router.refresh();
          }, 1250);
        } else {
          setState('wrong');
          // hold the shake, then clear so the next try starts clean
          setTimeout(() => {
            setPin('');
            setState('idle');
          }, 620);
        }
      } catch {
        setState('wrong');
        setTimeout(() => {
          setPin('');
          setState('idle');
        }, 620);
      }
    },
    [router]
  );

  const press = useCallback(
    (key) => {
      if (state === 'checking' || state === 'ok') return;
      if (key === 'del') {
        setPin((p) => p.slice(0, -1));
        return;
      }
      // Nothing but the new value goes in here. Submitting from inside the
      // updater meant React calling it twice — which it is free to do, and does
      // in development — sent two unlock requests and wrote "Signed in" to the
      // log twice for one entry of the PIN.
      setPin((p) => (p.length >= LENGTH ? p : p + key));
    },
    [state]
  );

  // the fourth digit is what submits, watched here rather than fired from the
  // updater. `idle` gates it, so a checking or finished attempt can't resubmit.
  useEffect(() => {
    if (pin.length === LENGTH && state === 'idle') submit(pin);
  }, [pin, state, submit]);

  // a hardware keyboard should work too — this is a web page, not a phone
  useEffect(() => {
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <main
      style={{
        // exactly one screen, never a scroll: the key size is what gives
        '--pad-gap': 'clamp(10px, 3.2vw, 18px)',
        '--key': 'min(27vw, 15dvh, 118px)',
        height: '100dvh',
        overflow: 'hidden',
        background: C.canvas,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'env(safe-area-inset-top) 16px calc(12px + env(safe-area-inset-bottom))',
        userSelect: 'none',
      }}
    >
      <style>{`
        @keyframes pinPop   { 0% { transform: scale(.4); opacity: .3 } 60% { transform: scale(1.25) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes pinShake { 0%,100% { transform: translateX(0) } 15% { transform: translateX(-9px) } 30% { transform: translateX(9px) } 45% { transform: translateX(-6px) } 60% { transform: translateX(6px) } 80% { transform: translateX(-2px) } }
        @keyframes pinGlow  { 0% { box-shadow: 0 0 0 0 var(--accent-ring) } 100% { box-shadow: 0 0 0 16px rgba(142,125,255,0) } }
        @keyframes markIn   { 0% { transform: scale(.7) rotate(-8deg); opacity: 0 } 100% { transform: scale(1) rotate(0); opacity: 1 } }
        @keyframes sayHi { 0% { transform: translateY(5px); opacity: 0 } 100% { transform: none; opacity: 1 } }
        .pin-say { animation: sayHi 240ms cubic-bezier(.2,.9,.3,1.2) both; }
        .pin-key { transition: transform 90ms ease, background 140ms ease; }
        .pin-key:active { transform: scale(.92); background: #EEECFD !important; }
        @media (prefers-reduced-motion: reduce) {
          .pin-dot, .pin-row, .pin-mark, .pin-say { animation: none !important; }
        }
      `}</style>

      <span
        className="pin-mark"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 46,
          height: 46,
          borderRadius: 14,
          background: 'var(--accent-tint)',
          color: C.accent,
          animation: 'markIn 420ms cubic-bezier(.2,.9,.3,1.2) both',
        }}
      >
        <Mark size={25} strokeWidth={1.5} />
      </span>

      <h1
        style={{
          margin: '14px 0 3px',
          fontFamily: 'var(--display), sans-serif',
          fontSize: 24,
          letterSpacing: '-0.035em',
          fontWeight: 700,
          color: C.ink,
        }}
      >
        The Deck
      </h1>
      {/* The greeting is the PIN telling you who it thinks you are. It gets a
          size of its own — at 13.5px it read as a status line, and it's the one
          thing on this screen worth a beat. Fixed height so the pad doesn't
          shift underneath it when the text grows. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 26,
        }}
      >
        <span
          key={state === 'ok' && name ? `hi-${name}` : state}
          className="pin-say"
          style={{
            fontFamily: state === 'ok' && name ? 'var(--display), sans-serif' : 'inherit',
            fontSize: state === 'ok' && name ? 19 : 13.5,
            letterSpacing: state === 'ok' && name ? '-0.03em' : 0,
            fontWeight: state === 'ok' && name ? 700 : 400,
            color: state === 'wrong' ? C.bad : state === 'ok' ? C.accent : C.muted,
            lineHeight: 1.15,
          }}
        >
          {state === 'wrong'
            ? 'Wrong PIN'
            : state === 'ok' && name
              ? `Hey ${name}`
              : 'Enter your PIN'}
        </span>
      </div>

      {/* dots */}
      <div
        className="pin-row"
        style={{
          display: 'flex',
          gap: 18,
          margin: '24px 0 34px',
          animation: state === 'wrong' ? 'pinShake 560ms ease' : 'none',
        }}
      >
        {Array.from({ length: LENGTH }).map((_, i) => {
          const filled = i < pin.length;
          const color = state === 'wrong' ? C.bad : C.accent;
          return (
            <span
              key={i}
              className="pin-dot"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: filled ? color : 'transparent',
                border: `2px solid ${filled ? color : 'var(--dot)'}`,
                animation: filled
                  ? `pinPop 260ms cubic-bezier(.2,.9,.3,1.4)${
                      state === 'ok' ? `, pinGlow 420ms ease-out ${i * 45}ms` : ''
                    }`
                  : 'none',
              }}
            />
          );
        })}
      </div>

      {/* pad */}
      <div
        style={{
          display: 'grid',
          // keys scale with the viewport but never get silly — thumb-sized on a
          // phone, genuinely big on a desktop
          // sized off height as well as width, so four rows always clear the
          // notch and the home indicator on a short iPhone without scrolling
          gridTemplateColumns: 'repeat(3, var(--key))',
          gap: 'var(--pad-gap)',
          justifyContent: 'center',
        }}
      >
        {KEYS.map((k, i) =>
          k === null ? (
            // not `key={i}` — the blank slot sits at index 9 and collided with
            // the "9" key's own key, which React warns about on every render
            <span key={`gap-${i}`} />
          ) : (
            <button
              key={k}
              className="pin-key"
              onClick={() => press(k)}
              aria-label={k === 'del' ? 'Delete' : k}
              style={{
                width: 'var(--key)',
                height: 'var(--key)',
                borderRadius: 'calc(var(--key) / 4)',
                border: k === 'del' ? '1px solid transparent' : `1px solid ${C.line}`,
                background: k === 'del' ? 'transparent' : C.surface,
                color: k === 'del' ? C.muted : C.ink,
                fontFamily: 'var(--display), sans-serif',
                fontSize: 'calc(var(--key) * 0.36)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: k === 'del' ? 'none' : '0 2px 6px var(--shadow)',
              }}
            >
              {k === 'del' ? <Delete size={26} /> : k}
            </button>
          )
        )}
      </div>
    </main>
  );
}
