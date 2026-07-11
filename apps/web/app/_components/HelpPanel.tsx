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

  // The trigger lives in a fixed top-right corner, so the balloon always opens downward
  // and to the left of it — that direction always has the most room in that corner, so
  // there's nothing to "flip" (a flip here is what previously pushed it off-screen at the
  // top). Instead, clamp width/height to whatever room is actually available so it only
  // scrolls internally if the display genuinely doesn't have space, not by default.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPanelWidth(Math.min(672, window.innerWidth - 32));
    setPanelMaxHeight(Math.max(200, window.innerHeight - rect.bottom - 24));
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
    // Fixed at the same on-screen spot on every page — top-right, just below the sticky
    // navbar/breadcrumb strip — instead of being laid out inline next to each page's own
    // heading, which produced inconsistent, cramped "half-width" headers across pages.
    <div ref={wrapperRef} className="fixed top-[4.75rem] right-4 z-[1000]">
      <button
        className={`btn btn-ghost btn-sm gap-1 bg-base-100 shadow ${done ? 'text-base-content/60' : 'text-info'}`}
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
        <>
          <div className="fixed inset-0 z-[1001] backdrop-blur-[2px] bg-black/10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            style={{ width: panelWidth, maxHeight: panelMaxHeight }}
            className="absolute z-[1002] top-full right-0 mt-2 flex flex-col card bg-base-100 border border-info/20 shadow-2xl p-5 space-y-3"
            role="region"
            aria-label={`Help: ${title}`}
          >
            {/* Balloon caret — always top-right, matching the fixed open-downward-left anchor */}
            <div className="absolute -top-1.5 right-3 w-3 h-3 bg-base-100 rotate-45 border-l border-t border-info/20" />

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
