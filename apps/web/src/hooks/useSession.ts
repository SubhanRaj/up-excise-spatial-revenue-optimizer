'use client';

import { useState, useEffect } from 'react';

export interface SessionInfo {
  deoId: string;
  name: string;
  role: string;
  districtName: string | null;
  email: string;
}

// ponytail: module-level cache — one fetch per tab, shared across all components
let cached: SessionInfo | null = null;
let pending: Promise<SessionInfo | null> | null = null;

async function fetchSession(): Promise<SessionInfo | null> {
  if (cached) return cached;
  if (pending) return pending;
  pending = fetch('/api/auth/session')
    .then(r => (r.ok ? r.json() as Promise<SessionInfo> : null))
    .then(s => { cached = s; pending = null; return s; })
    .catch(() => { pending = null; return null; });
  return pending;
}

export function useSession() {
  const [session, setSession] = useState<SessionInfo | null>(cached);

  useEffect(() => {
    if (cached) return;
    void fetchSession().then(setSession);
  }, []);

  return { session };
}
