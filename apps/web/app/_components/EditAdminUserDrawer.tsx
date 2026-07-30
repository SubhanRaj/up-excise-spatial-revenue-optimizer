'use client';

import { useEffect, useState } from 'react';

export interface AdminUserRow {
  id: number;
  name: string;
  designation: string | null;
  createdAt: string | null;
  isOwner: boolean;
}

interface EditForm { name: string; email: string; designation: string }

// Shared with the "create new admin" flow — pass user: null for create mode.
export function EditAdminUserDrawer({ user, onClose, onSaved }: {
  user: AdminUserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreate = user === null;
  const [form, setForm] = useState<EditForm>({ name: user?.name ?? '', email: '', designation: user?.designation ?? '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose(); }
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  function set(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function save() {
    setError(null);
    const name = form.name.trim();
    const email = form.email.trim();
    const designation = form.designation.trim();

    if (isCreate || email !== '') {
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!EMAIL_RE.test(email)) {
        setError('Please enter a valid email address');
        return;
      }
    }
    if (isCreate && !name) {
      setError('Name is required');
      return;
    }

    setSaving(true);

    let res: Response;
    if (isCreate) {
      res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, designation: designation || null }),
      });
    } else {
      const body: Record<string, unknown> = {};
      if (name !== user.name) body.name = name;
      if (email !== '') body.email = email;
      if (designation !== (user.designation ?? '')) body.designation = designation || null;
      if (Object.keys(body).length === 0) {
        setSaving(false);
        setError('No changes to save');
        return;
      }
      res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? 'Failed to save changes');
      return;
    }
    setSaved(true);
    setTimeout(() => { onSaved(); }, isCreate ? 300 : 600);
  }

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      <div className={`relative flex flex-col w-full max-w-sm h-full bg-base-100 shadow-2xl transition-transform duration-200 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100 sticky top-0 z-10">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-medium text-base-content/60 mb-0.5">
              {isCreate ? 'New Admin Account' : 'Edit Admin Account'}
            </p>
            <h3 className="text-base font-bold leading-tight">{isCreate ? 'Add a user' : user.name}</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={handleClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="alert alert-error text-sm py-2 px-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {!isCreate && user.isOwner && (
            <div className="alert alert-warning text-xs py-2 px-3">
              This is the portal owner account. Its sign-in email is fixed by server configuration — only name and designation can be changed here.
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-base-content/60 border-b border-base-200 pb-1">Identity</p>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Full Name {isCreate && <span className="text-error">*</span>}</span>
              <input className="input input-bordered input-sm" placeholder="e.g. Anjali Verma" value={form.name} onChange={set('name')} maxLength={100} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">
                Email {isCreate && <span className="text-error">*</span>}
                {!isCreate && !user.isOwner && <span className="text-base-content/60 font-normal"> (leave blank to keep unchanged)</span>}
              </span>
              <input
                type="email" className="input input-bordered input-sm font-mono text-xs"
                placeholder="officer@up-excise.gov.in" value={form.email} onChange={set('email')}
                maxLength={200} disabled={!isCreate && user.isOwner}
              />
            </label>
            <label className="form-control">
              <span className="label-text text-xs font-medium mb-1">Designation <span className="text-base-content/60 font-normal">(optional)</span></span>
              <input className="input input-bordered input-sm" placeholder="e.g. Excise Commissioner" value={form.designation} onChange={set('designation')} maxLength={100} />
            </label>
          </div>

          {isCreate && (
            <p className="text-xs text-base-content/70">
              No email is sent automatically. Share the login link with this person — they sign in with a magic link sent to the email above.
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-base-200 bg-base-100 flex gap-2">
          <button className="btn btn-primary btn-sm flex-1" onClick={save} disabled={saving}>
            {saving
              ? <><span className="loading loading-spinner loading-xs" /> Saving…</>
              : saved
              ? <><svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved</>
              : isCreate ? 'Create Account' : 'Save Changes'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
