'use client';

import { useEffect, useRef, useState } from 'react';

interface HelpPanelProps {
  pageKey: string;
  title: string;
  children: React.ReactNode;
}

export default function HelpPanel({ pageKey, title, children }: HelpPanelProps) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setDone(localStorage.getItem(storageKey) === 'true'); } catch { }
  }, [storageKey]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function markDone() {
    try { localStorage.setItem(storageKey, 'true'); } catch { }
    setDone(true);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        className={`btn btn-ghost btn-xs gap-1 ${done ? 'text-base-content/40' : 'text-info'}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-[min(28rem,90vw)] card bg-base-100 border border-info/20 shadow-2xl p-4 space-y-3"
          role="region"
          aria-label={`Help: ${title}`}
        >
          {/* Balloon caret */}
          <div className="absolute -top-2 left-3 w-3 h-3 bg-base-100 border-l border-t border-info/20 rotate-45" />

          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm text-info">{title}</h3>
            <button
              className="btn btn-ghost btn-xs shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Close help panel"
            >
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
      )}
    </div>
  );
}
