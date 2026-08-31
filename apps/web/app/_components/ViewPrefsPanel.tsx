'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Prefs {
  fontSize: 'sm' | 'base' | 'lg';
  density: 'compact' | 'normal' | 'spacious';
  width: 'normal' | 'wide' | 'full';
}

type ThemeMode = 'light' | 'system' | 'dark';

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

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem('theme', mode === 'system' ? 'system' : resolved);
}

export default function ViewPrefsPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
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

    // Restore theme mode and re-apply (handles refresh with system mode stored)
    try {
      const t = localStorage.getItem('theme') as ThemeMode | null;
      const mode: ThemeMode = t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'system';
      setThemeMode(mode);
      applyTheme(mode);
    } catch { /* ignore */ }

    // Update in real-time when OS switches light/dark while theme mode is 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange() {
      const current = localStorage.getItem('theme');
      if (current !== 'light' && current !== 'dark') applyTheme('system');
    }
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function setTheme(mode: ThemeMode) {
    setThemeMode(mode);
    applyTheme(mode);
  }

  function reset() {
    setPrefs(DEFAULT_PREFS);
    applyPrefs(DEFAULT_PREFS);
    setTheme('system');
    try { localStorage.removeItem(PREFS_KEY); } catch { /* ignore */ }
  }

  const btnClass = (active: boolean) =>
    `flex-1 py-1 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-content' : 'hover:bg-base-200 text-base-content/80'
    }`;

  // Login/verify pages show only the device/localStorage-resolved theme (handled by the
  // anti-flash script in layout.tsx) — no customization FAB before a user is signed in.
  if (pathname === '/login' || pathname?.startsWith('/auth')) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-16 right-4 z-40 w-56 rounded-xl border border-base-300 bg-base-100 shadow-2xl p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-base-content/90">View Preferences</span>
            <button className="btn btn-ghost btn-xs text-base-content/70" onClick={reset}>↺ Reset</button>
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/60">Theme</p>
            <div className="flex gap-1">
              <button className={btnClass(themeMode === 'light')} onClick={() => setTheme('light')}>
                {/* tabler:sun */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              </button>
              <button className={btnClass(themeMode === 'system')} onClick={() => setTheme('system')}>Auto</button>
              <button className={btnClass(themeMode === 'dark')} onClick={() => setTheme('dark')}>
                {/* tabler:moon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>
              </button>
            </div>
          </div>

          {/* Font Size */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/60">Font Size</p>
            <div className="flex gap-1">
              <button className={btnClass(prefs.fontSize === 'sm')} onClick={() => update({ fontSize: 'sm' })}>S</button>
              <button className={btnClass(prefs.fontSize === 'base')} onClick={() => update({ fontSize: 'base' })}>M</button>
              <button className={btnClass(prefs.fontSize === 'lg')} onClick={() => update({ fontSize: 'lg' })}>L</button>
            </div>
          </div>

          {/* Density */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/60">Density</p>
            <div className="flex gap-1">
              <button className={btnClass(prefs.density === 'compact')} onClick={() => update({ density: 'compact' })}>Compact</button>
              <button className={btnClass(prefs.density === 'normal')} onClick={() => update({ density: 'normal' })}>Normal</button>
              <button className={btnClass(prefs.density === 'spacious')} onClick={() => update({ density: 'spacious' })}>Spacious</button>
            </div>
          </div>

          {/* Width */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-base-content/60">Width</p>
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
        title="View preferences (font, density, width, theme)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="14" cy="6" r="2"/><line x1="4" y1="6" x2="12" y2="6"/><line x1="16" y1="6" x2="20" y2="6"/><circle cx="8" cy="12" r="2"/><line x1="4" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="20" y2="12"/><circle cx="17" cy="18" r="2"/><line x1="4" y1="18" x2="15" y2="18"/><line x1="19" y1="18" x2="20" y2="18"/></svg>
      </button>
    </>
  );
}
