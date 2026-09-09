// Shared full-name validator for the "type your name to confirm" prompts — the DEO submit /
// final-verify lock (apps/web/app/(deo)/verify/page.tsx) and the Deputy division lock
// (apps/web/app/(deputy)/deputy/page.tsx). Rejects blank input, digits (catches a pasted CUG
// number), a designation instead of a name, and non-English characters. Bilingual messages.
const NAME_CHARS_RE = /^[A-Za-z][A-Za-z.\-' ]*$/;
const DESIGNATION_RE = /\b(deo|adeo|d\.?e\.?o\.?|dec|deputy|excise\s*officer|officer|commissioner|admin)\b/i;

export function validatePersonName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Please enter your full name. / कृपया अपना पूरा नाम दर्ज करें।';
  if (/\d/.test(trimmed)) return 'Name must not contain numbers — do not type your CUG number here. / नाम में अंक नहीं होने चाहिए।';
  if (DESIGNATION_RE.test(trimmed)) return 'Please enter your actual name, not your designation. / कृपया अपना पद नहीं, नाम दर्ज करें।';
  if (!NAME_CHARS_RE.test(trimmed)) return 'Please enter your name in English letters only (dots/hyphens allowed). / कृपया केवल अंग्रेज़ी अक्षरों में नाम दर्ज करें।';
  return undefined;
}
