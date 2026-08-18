'use client';

import { useEffect } from 'react';

function splitUnitName(name: string): { label: string; area: string } {
  const idx = name.indexOf(' - ');
  return idx === -1 ? { label: name, area: '' } : { label: name.slice(0, idx), area: name.slice(idx + 3) };
}

/** Shared circles/sectors modal — shown when the "Circles & Sectors" stat card is clicked, on
 * both the admin district detail page and the DEO final-verification screen. */
export function UnitsModal({ units, districtName, onClose }: { units: { name: string; type: string }[]; districtName: string; onClose: () => void }) {
  const sectors = units.filter((u) => u.type === 'sector');
  const circles = units.filter((u) => u.type === 'circle');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-[fadeIn_0.15s_ease-out]" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl border border-base-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-[modalIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-primary/10 to-transparent border-b border-base-200">
          <div>
            <h3 className="font-bold text-base">{districtName}</h3>
            <p className="text-xs text-base-content/60">{units.length} unit{units.length === 1 ? '' : 's'} registered · {sectors.length} sector{sectors.length === 1 ? '' : 's'} · {circles.length} circle{circles.length === 1 ? '' : 's'}</p>
          </div>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-6">
          {units.length === 0 && (
            <p className="text-sm text-base-content/60 text-center py-8">No circles or sectors registered yet.</p>
          )}
          {sectors.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold text-secondary mb-2.5">Sectors</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {sectors.map((u) => (
                  // Sectors carry no area name — "Sector - N" is the whole unit label
                  // (splitUnitName's dash-split is circle-only, see the Circles block below).
                  <div key={u.name} className="flex items-center gap-2.5 rounded-lg border border-base-200 bg-base-200/40 px-3 py-2">
                    <span className="badge badge-secondary badge-sm h-auto py-1 px-2 shrink-0 whitespace-nowrap font-semibold">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {circles.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest font-semibold text-accent mb-2.5">Circles</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {circles.map((u) => {
                  const { label, area } = splitUnitName(u.name);
                  return (
                    <div key={u.name} className="flex items-center gap-2.5 rounded-lg border border-base-200 bg-base-200/40 px-3 py-2">
                      <span className="badge badge-accent badge-sm h-auto py-1 px-2 shrink-0 whitespace-nowrap font-semibold">{label}</span>
                      <span className="text-sm truncate">{area || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
