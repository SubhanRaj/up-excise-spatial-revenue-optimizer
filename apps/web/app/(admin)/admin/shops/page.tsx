'use client';

import { useMemo } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { useAdminExportData } from '@/hooks/useAdminExportData';
import { useExcludeHbrPrv } from '@/hooks/useExcludeHbrPrv';
import { ShopExplorer } from '@/components/ShopExplorer';
import type { ExportShopRow } from '@/lib/excel';

const fmt = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`;

// State-wide shop explorer — same ShopExplorer component every district page and the DEO
// final-verification screen already use, fed from the same export_cache IndexedDB entry the
// Circle & Sector Master page reads (useAdminExportData: cache-first, no fetch on mount). This
// page has no refresh button of its own — the navbar's Sync All is the only thing that reads
// D1 for this data, so opening this page never costs a D1 read no matter how often it's visited.
// Adds a District column/filter/sort on top of what ShopExplorer already does; the circle/sector
// breakdown and Thana-variant cards are turned off here since both key off circleSectorName/
// thanaName alone, which collide across districts state-wide (see ShopExplorer's
// showCircleBreakdown/showThanaVariants doc comment).
export default function AllShopsPage() {
  const { data, loading } = useAdminExportData();
  const shops: ExportShopRow[] = data?.rows ?? [];

  const { hasHbrOrPrv, excludeHbrPrv, setExcludeHbrPrv, effectiveShops } = useExcludeHbrPrv('admin-shops', 'all', shops);

  const totalRevenue = useMemo(() => effectiveShops.reduce((s, r) => s + r.totalRevenue, 0), [effectiveShops]);
  const districtCount = useMemo(() => new Set(effectiveShops.map((s) => s.districtName)).size, [effectiveShops]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Shops</h1>
          <p className="text-sm text-base-content/70 mt-0.5">Every uploaded shop across all 75 districts, in one searchable table.</p>
        </div>
        <div className="ml-auto">
          <HelpPanel pageKey="admin_shops" title="All Shops">
            <p>Every shop from every district in one table — the same filters, sort, group-by-type, and Excel export as a district's own page, plus a District column.</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li><strong>District</strong> — filter or sort to one district, or leave on All.</li>
              <li><strong>Exclude HBR &amp; PRV</strong> — same toggle as a district page, for cross-checking the remaining revenue against external sources that don't cover those two types.</li>
            </ul>
          </HelpPanel>
        </div>
      </div>

      {!loading && !data ? (
        <div className="bg-base-100 rounded-xl border border-base-200 p-6 text-center text-sm text-base-content/70">
          No data loaded yet — click <strong>Sync All</strong> at the top of the page.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Total shops</span>
              <span className="font-bold tabular-nums">{effectiveShops.length.toLocaleString()}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Total revenue</span>
              <span className="font-bold text-primary tabular-nums">{fmt(totalRevenue)}</span>
            </div>
            <div className="bg-base-100 rounded-xl border border-base-200 px-4 py-2 flex items-center gap-2">
              <span className="text-xs text-base-content/70">Districts with data</span>
              <span className="font-bold tabular-nums">{districtCount}</span>
            </div>
          </div>

          <ShopExplorer
            shops={effectiveShops}
            units={data?.units ?? []}
            districtName="All Districts"
            loading={loading}
            storageKeyPrefix="admin-shops"
            hasHbrOrPrv={hasHbrOrPrv}
            excludeHbrPrv={excludeHbrPrv}
            onExcludeHbrPrvChange={setExcludeHbrPrv}
            showDistrictColumn
            showCircleBreakdown={false}
            showThanaVariants={false}
          />
        </>
      )}
    </div>
  );
}
