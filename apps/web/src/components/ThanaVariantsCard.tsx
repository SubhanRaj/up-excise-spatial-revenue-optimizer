'use client';

/** Groups of Thana names that look like spelling variants of the same station — shown for
 * review, never auto-merged. Shared by ShopExplorer (admin district page, DEO final-verification
 * screen) and the DEO staged-review table on /verify, so a DEO sees this before submitting, not
 * only after. See findThanaNameVariants() in apps/web/src/lib/thana-name.ts. */
export function ThanaVariantsCard({ clusters }: { clusters: string[][] }) {
  if (clusters.length === 0) return null;
  return (
    <div className="bg-warning/5 rounded-xl border border-warning/30 p-4">
      <p className="text-[11px] uppercase tracking-widest font-medium text-warning mb-2">
        ⚠ Possible Duplicate Thana Names ({clusters.length})
      </p>
      <p className="text-xs text-base-content/70 mb-3">
        These groups of Thana names look like spelling variants of the same place, which inflates the Thana count on the breakdown above. Confirm with your Inspectors and correct any typos before submitting.
      </p>
      <div className="flex flex-wrap gap-3">
        {clusters.map((group) => (
          <div key={group.join('|')} className="flex flex-wrap items-center gap-1 rounded-lg border border-warning/40 bg-base-100 px-2.5 py-1.5">
            {group.map((name, i) => (
              <span key={name}>
                <span className="text-xs font-medium">{name}</span>
                {i < group.length - 1 && <span className="text-base-content/40 mx-1">≈</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
