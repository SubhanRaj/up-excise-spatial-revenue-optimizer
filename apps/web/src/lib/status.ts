// Single source of truth for districts.status display + lock semantics — was previously
// copy-pasted as inline ternaries across 6+ admin pages, which is how a 4th status value
// ('verified', M-60) would've silently fallen through to the 'pending' fallback in half of
// them if each site had to be hand-updated separately.

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  verified: 'Verified',
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: 'badge-ghost',
  in_progress: 'badge-warning',
  submitted: 'badge-success',
  verified: 'badge-info',
};

// Choropleth fill / chart colors
export const STATUS_COLOR: Record<string, string> = {
  pending: '#94a3b8',   // slate-400
  in_progress: '#f59e0b', // amber-500
  submitted: '#16a34a', // green-600
  verified: '#2563eb',  // blue-600
};

export function statusLabel(status: string | null | undefined): string {
  return STATUS_LABEL[status ?? 'pending'] ?? 'Pending';
}

export function statusBadgeClass(status: string | null | undefined): string {
  return STATUS_BADGE_CLASS[status ?? 'pending'] ?? 'badge-ghost';
}

// 'submitted' and 'verified' both mean "this district's shop data is locked against new
// uploads" — 'verified' is strictly further along the same locked state, never a reason to
// unlock. Used for every upload/edit gate; NOT used for "has this DEO submitted at all"
// checks where only the exact 'submitted' transition matters (there are none currently).
export function isLocked(status: string | null | undefined): boolean {
  return status === 'submitted' || status === 'verified';
}
