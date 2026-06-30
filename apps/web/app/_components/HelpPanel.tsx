'use client';

import { useEffect, useState } from 'react';

interface HelpPanelProps {
  pageKey: string;
  title: string;
  children: React.ReactNode;
}

/**
 * Collapsible help panel. Never auto-opens — triggered only by the user.
 * localStorage key `help_done_{pageKey}` tracks whether the user has marked it complete.
 * Opens as a fixed overlay (blur backdrop) — does not displace content.
 */
export default function HelpPanel({ pageKey, title, children }: HelpPanelProps) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try { setDone(localStorage.getItem(storageKey) === 'true'); } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function markDone() {
    try { localStorage.setItem(storageKey, 'true'); } catch { /* ignore */ }
    setDone(true);
    setOpen(false);
  }

  return (
    <>
      <button
        className={`btn btn-ghost btn-xs gap-1 ${done ? 'text-base-content/40' : 'text-info'}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`help-panel-${pageKey}`}
        aria-label={open ? 'Close help' : 'Open help and instructions'}
      >
        {/* tabler:help-circle */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 17v.01"/>
          <path d="M12 13.5a1.5 1.5 0 0 1 1-1.5 2.6 2.6 0 1 0-3-2.5"/>
        </svg>
        {done ? 'Help' : 'Help / Instructions'}
        {done && (
          /* tabler:circle-check (tiny) */
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div
            id={`help-panel-${pageKey}`}
            className="fixed z-50 top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg card bg-base-100 shadow-2xl border border-info/20 p-5 space-y-3"
            role="region"
            aria-label={`Help: ${title}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm text-info">{title}</h3>
              <button
                className="btn btn-ghost btn-xs shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Close help panel"
              >
                {/* tabler:x */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="text-sm text-base-content/80 space-y-2">
              {children}
            </div>

            {!done && (
              <button className="btn btn-info btn-xs" onClick={markDone}>
                Got it — don&apos;t show hint badge again
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
