// Browser-only SHA-256 (Web Crypto) — mirrors sha256hex in src/lib/auth.ts, which imports
// server-only modules and can't be used from a 'use client' component.
export async function sha256HexClient(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
