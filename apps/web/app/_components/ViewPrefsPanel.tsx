'use client';

import { useEffect, useRef, useState } from 'react';

interface Prefs {
  fontSize: 'sm' | 'base' | 'lg';
  density: 'compact' | 'normal' | 'spacious';
  width: 'normal' | 'wide' | 'full';
}

const PREFS_KEY = 'excise-view-prefs-v1';

const DEFAULT_PREFS: Prefs = { fontSize: 'base', density: 'normal', width: 'normal' };

function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  if (p.fontSize === 'base') el.removeAttribute('data-font-size');
  else el.setAttribute('data-font-size', p.fontSize);
  if (p.density === 'normal') el.removeAttribute('data-density');
  else el.setAttribute('data-density', p.density);
  if (p.width === 'normal') el.removeAttribute('data-view-width');
  else el.setAttribute('data-view-width', p.width);
}

export default function ViewPrefsPanel() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        const p = JSON.parse(stored) as Prefs;
        setPrefs(p);
        applyPrefs(p);
      }
    } catch { /* ignore */ }
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function reset() {
    setPrefs(DEFAULT_PREFS);
    applyPrefs(DEFAULT_PREFS);
    try { localStorage.removeItem(PREFS_KEY); } catch { /* ignore */ }
  }

  const btnClass = (active: boolean) =>
    `flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/60'
    }`;

  return (
    <>
      {/* Click-outside backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-16 right-4 z-40 w-52 rounded-xl border border-base-300 bg-base-100 shadow-2xl p-3 space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-base-content/70">View</span>
            <button className="btn btn-ghost btn-xs text-base-content/50" onClick={reset}>
              ↺ Reset
            </button>
          </div>

          {/* Font Size */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/40">Font Size</p>
            <div className="flex gap-1">
              <button className={btnClass(prefs.fontSize === 'sm')} onClick={() => update({ fontSize: 'sm' })}>S</button>
              <button className={btnClass(prefs.fontSize === 'base')} onClick={() => update({ fontSize: 'base' })}>M</button>
              <button className={btnClass(prefs.fontSize === 'lg')} onClick={() => update({ fontSize: 'lg' })}>L</button>
            </div>
          </div>

          {/* Density */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/40">Density</p>
            <div className="flex gap-1">
              <button className={btnClass(prefs.density === 'compact')} onClick={() => update({ density: 'compact' })}>Compact</button>
              <button className={btnClass(prefs.density === 'normal')} onClick={() => update({ density: 'normal' })}>Normal</button>
              <button className={btnClass(prefs.density === 'spacious')} onClick={() => update({ density: 'spacious' })}>Spacious</button>
            </div>
          </div>

          {/* Width */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/40">Width</p>
            <div className="flex gap-1">
              <button className={btnClass(prefs.width === 'normal')} onClick={() => update({ width: 'normal' })}>Normal</button>
              <button className={btnClass(prefs.width === 'wide')} onClick={() => update({ width: 'wide' })}>Wide</button>
              <button className={btnClass(prefs.width === 'full')} onClick={() => update({ width: 'full' })}>Full</button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        className={`fixed bottom-4 right-4 z-40 rounded-full w-10 h-10 flex items-center justify-center border shadow-lg transition-colors ${
          open ? 'bg-primary text-primary-content border-primary' : 'bg-base-100 border-base-300 hover:bg-base-200 text-base-content'
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-label="View preferences"
        aria-expanded={open}
      >
        {/* tabler:adjustments-horizontal */}
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="14" cy="6" r="2"/><line x1="4" y1="6" x2="12" y2="6"/><line x1="16" y1="6" x2="20" y2="6"/><circle cx="8" cy="12" r="2"/><line x1="4" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="20" y2="12"/><circle cx="17" cy="18" r="2"/><line x1="4" y1="18" x2="15" y2="18"/><line x1="19" y1="18" x2="20" y2="18"/></svg>
      </button>
    </>
  );
}
