'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ON_PREMISES_CONSUMPTION_FEE = 300_000;
const BHANG_MGQ_MULTIPLIER = 20;

export interface RevenueShopFields {
  shopType: string;
  hasCl5cc: boolean;
  totalRevenue: number;
  licenseFeeLf: number;
  basicLicenseFeeBlf: number;
  mgrAmount: number;
  compositeLfFl: number;
  compositeLfBeer: number;
  compositeMgrFl: number;
  compositeMgrBeer: number;
  mgqQuantity: number;
  considerationFee: number;
  specialBeerLf: number;
  specialBeerMgr: number;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function breakdownLines(s: RevenueShopFields): [string, number][] {
  const lines: [string, number][] = [];
  if (s.shopType === 'MODEL_SHOP') {
    lines.push(
      ['License Fee (LF)', s.licenseFeeLf],
      ['MGR Amount', s.mgrAmount],
      ['On-Premises Consumption Fee', ON_PREMISES_CONSUMPTION_FEE],
    );
  } else if (s.shopType === 'COMPOSITE_SHOP') {
    lines.push(
      ['LF – FL', s.compositeLfFl],
      ['LF – Beer', s.compositeLfBeer],
      ['MGR – FL', s.compositeMgrFl],
      ['MGR – Beer', s.compositeMgrBeer],
    );
  } else if (s.shopType === 'PRV') {
    lines.push(['License Fee (LF)', s.licenseFeeLf], ['MGR Amount', s.mgrAmount]);
  } else if (s.shopType === 'BHANG_SHOP') {
    lines.push(
      ['License Fee (LF)', s.licenseFeeLf],
      [`MGQ (${s.mgqQuantity} × ₹${BHANG_MGQ_MULTIPLIER})`, s.mgqQuantity * BHANG_MGQ_MULTIPLIER],
    );
  } else if (s.shopType === 'COUNTRY_LIQUOR') {
    lines.push(
      ['Basic License Fee (BLF)', s.basicLicenseFeeBlf],
      ['Consideration Fee', s.considerationFee],
    );
    if (s.hasCl5cc)
      lines.push(['Special Beer LF', s.specialBeerLf], ['Special Beer MGR', s.specialBeerMgr]);
  } else if (s.shopType === 'HBR') {
    // roadmap.md §Revenue Formulas: HBR = license_fee_lf + consideration_fee. This branch was
    // missing entirely, so every HBR row silently rendered an empty breakdown (just the Total
    // footer) instead of these two components.
    lines.push(
      ['License Fee (LF)', s.licenseFeeLf],
      ['Consideration Fee', s.considerationFee],
    );
  }
  return lines;
}

const POPUP_WIDTH = 224; // w-56

// Only one breakdown popup open at a time across the whole table — each instance is an
// independent <details>, so opening a second row's popup previously left the first one open
// too (both are portaled to <body>, so nothing in the DOM tree naturally closed either one).
// Tracked by a stable per-instance token (not function identity — a plain closure recreated
// on every render would never equal itself across renders) paired with whichever `close`
// closure was current when it opened.
let active: { token: object; run: () => void } | null = null;

export function RevenueCell({ s }: { s: RevenueShopFields }) {
  const lines = breakdownLines(s);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const token = useRef({}).current;

  // Rendered via a fixed-position portal to <body> instead of an absolutely-positioned child
  // of the <details> — the previous approach measured correctly against the viewport but was
  // still a DOM descendant of the table's `.overflow-auto` wrapper, so CSS clipped it to that
  // wrapper's own (short, for a filtered few-row table) content box regardless of the flip
  // math. A portal has no such ancestor, so it can never be clipped by the table's scroll box.
  function close() {
    setOpen(false);
    // Native <details> only closes itself when its own <summary> is clicked again — closing
    // programmatically (outside click, Escape, filter change) has to also flip the DOM
    // element's own open state, or the next click on the summary would toggle it back open
    // immediately (browser thinks it's still open, so a click "closes" it right back to shut).
    if (detailsRef.current) detailsRef.current.open = false;
    if (active?.token === token) active = null;
  }

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
    if (!isOpen) {
      if (active?.token === token) active = null;
      return;
    }
    if (active && active.token !== token) active.run();
    active = { token, run: close };
    const rect = e.currentTarget.getBoundingClientRect();
    const popupHeightEst = 100 + lines.length * 20;
    const fitsBelow = rect.bottom + popupHeightEst <= window.innerHeight - 16;
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - POPUP_WIDTH - 8);
    const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - popupHeightEst - 4);
    setPos({ top, left });
  }

  // A native <details> popover has no "click outside to dismiss" behavior at all — was easy to
  // miss with the old absolutely-positioned version since it stayed visually pinned under its
  // row, but the fixed-position portal can float directly over unrelated controls (a filter
  // dropdown, another row) and silently intercept/obscure clicks there until the same summary
  // is clicked again. Close on outside click, Escape, or the table scrolling out from under a
  // popup whose position was only computed once at open time.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (detailsRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    function onScroll() { close(); }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A row can unmount while its popup is still marked active (e.g. a type filter change
  // removes it from the filtered list) — release the singleton so the next row to open
  // doesn't try to close an already-gone instance.
  useEffect(() => () => { if (active?.token === token) active = null; }, [token]);

  return (
    <details ref={detailsRef} className="cursor-pointer" onToggle={handleToggle}>
      <summary className="list-none select-none font-mono text-xs font-medium tabular-nums hover:underline decoration-dotted underline-offset-2">
        {fmt(s.totalRevenue)}
        <span className="ml-1 text-base-content/50">▾</span>
      </summary>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPUP_WIDTH }}
          className="z-[1200] rounded-lg border border-base-300 bg-base-100 p-3 shadow-lg text-xs"
        >
          <p className="text-base-content/70 font-medium uppercase tracking-wide text-[10px] mb-2">Revenue Breakdown</p>
          <div className="space-y-1">
            {lines.map(([label, val]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-base-content/80 truncate">{label}</span>
                <span className="font-mono tabular-nums shrink-0">{fmt(val)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-3 border-t border-base-200 pt-2 font-semibold">
            <span>Total</span>
            <span className="font-mono tabular-nums">{fmt(s.totalRevenue)}</span>
          </div>
        </div>,
        document.body,
      )}
    </details>
  );
}
