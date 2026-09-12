'use client';

import { useMemo, useState } from 'react';

/** Shared "exclude HBR & PRV" toggle state — see ShopExplorer's toolbar checkbox for why (the
 * e-Lottery/IESCMS external revenue sources don't cover either type). Lives outside ShopExplorer
 * so the page rendering it can filter its own top-of-page stat cards (vend count, total revenue)
 * by the same toggle — those numbers live outside ShopExplorer and previously never moved when
 * it was flipped. `hasHbrOrPrv` is computed from the unfiltered list so the checkbox doesn't
 * disappear the moment it's switched on.
 *
 * Persisted per district (`districtName` in the storage key), not portal-wide — this is a
 * this-district cross-check ("did this DEO's remaining revenue match the external source"),
 * not a standing preference, so switching it on for one district must not silently apply it to
 * the next district an admin opens. State-wide totals (the overview page, exports) never read
 * this toggle at all — they're the official total and always include every shop type. */
export function useExcludeHbrPrv<T extends { shopType: string }>(storageKeyPrefix: string, districtName: string, shops: T[]) {
  const storageKey = `${storageKeyPrefix}-exclude-hbr-prv-${districtName}`;
  const hasHbrOrPrv = useMemo(() => shops.some((s) => s.shopType === 'HBR' || s.shopType === 'PRV'), [shops]);
  const [excludeHbrPrv, setExcludeHbrPrvState] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === 'true';
  });
  function setExcludeHbrPrv(checked: boolean) {
    setExcludeHbrPrvState(checked);
    try { localStorage.setItem(storageKey, String(checked)); } catch { }
  }
  const effectiveShops = useMemo(
    () => (excludeHbrPrv ? shops.filter((s) => s.shopType !== 'HBR' && s.shopType !== 'PRV') : shops),
    [shops, excludeHbrPrv],
  );
  return { hasHbrOrPrv, excludeHbrPrv, setExcludeHbrPrv, effectiveShops };
}
