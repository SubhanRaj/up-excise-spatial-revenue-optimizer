'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface HelpPanelProps {
  pageKey: string;
  title: string;
  children: React.ReactNode;
}

export default function HelpPanel({ pageKey, title, children }: HelpPanelProps) {
  const storageKey = `help_done_${pageKey}`;
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [panelWidth, setPanelWidth] = useState(672);
  const [panelMaxHeight, setPanelMaxHeight] = useState(480);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setDone(localStorage.getItem(storageKey) === 'true'); } catch { }
  }, [storageKey]);

  // The trigger is fixed at the bottom-right corner (stacked above the view-preferences
  // FAB), so the balloon always opens upward and to the left of it — that direction always
  // has the most room in that corner. Clamp width/height to whatever room is actually
  // available so it only scrolls internally if the display genuinely doesn't have space.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPanelWidth(Math.min(672, window.innerWidth - 32));
    setPanelMaxHeight(Math.max(200, rect.top - 24));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Block background scroll while the panel is open — it already visually blurs/dims the page.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function markDone() {
    try { localStorage.setItem(storageKey, 'true'); } catch { }
    setDone(true);
    setOpen(false);
  }

  return (
    // Fixed at the same on-screen spot on every page — bottom-right, stacked directly
    // above the view-preferences FAB — instead of being laid out inline next to each
    // page's own heading, which produced inconsistent, cramped "half-width" headers.
    <div ref={wrapperRef} className="group fixed bottom-16 right-4 z-[1000]">
      {!open && (
        <span className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-[1000]">
          {done ? 'Help' : 'Help / Instructions'}
        </span>
      )}
      <button
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors bg-base-100 ${done ? 'border-base-300 text-base-content/60 hover:bg-base-200' : 'border-info/30 text-info hover:bg-info/10'}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close help' : 'Open help and instructions'}
      >
        {/* tabler:help-circle */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 17v.01"/>
          <path d="M12 13.5a1.5 1.5 0 0 1 1-1.5 2.6 2.6 0 1 0-3-2.5"/>
        </svg>
        {!done && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-base-100" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1001] backdrop-blur-[2px] bg-black/10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            style={{ width: panelWidth, maxHeight: panelMaxHeight }}
            className="absolute z-[1002] bottom-full right-0 mb-2 flex flex-col card bg-base-100 border border-info/20 shadow-2xl p-5 space-y-3"
            role="region"
            aria-label={`Help: ${title}`}
          >
            {/* Balloon caret — always bottom-right, matching the fixed open-upward-left anchor */}
            <div className="absolute -bottom-1.5 right-3 w-3 h-3 bg-base-100 rotate-45 border-r border-b border-info/20" />

            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-base text-info">{title}</h3>
              <button
                className="btn btn-ghost btn-xs shrink-0"
                onClick={() => setOpen(false)}
                aria-label="Close help panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 text-sm text-base-content space-y-2 overflow-y-auto pr-1">
              {children}
            </div>

            {!done && (
              <button className="btn btn-info btn-xs shrink-0 self-start" onClick={markDone}>
                Got it — don&apos;t show hint badge again
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
