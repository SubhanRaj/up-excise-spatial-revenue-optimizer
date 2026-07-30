'use client';

import { useEffect, useState } from 'react';
import HelpPanel from '@/app/_components/HelpPanel';
import { useSession } from '@/hooks/useSession';
import { EditAdminUserDrawer, type AdminUserRow } from '@/app/_components/EditAdminUserDrawer';

type SwalGlobal = { Swal?: { fire: (o: Record<string, unknown>) => Promise<{ isConfirmed: boolean }> }; notyf?: { error: (m: string) => void } };

export default function AdminUsersPage() {
  const { session } = useSession();
  const restricted = session != null && session.role !== 'superadmin';

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUserRow | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json() as { users: AdminUserRow[] };
      setUsers(data.users);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!restricted) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted]);

  async function handleDelete(u: AdminUserRow) {
    const g = window as unknown as SwalGlobal;
    const confirmed = await g.Swal?.fire({
      icon: 'warning',
      title: `Delete ${u.name}?`,
      html: '<p>This permanently removes the account and signs them out of any active session. This cannot be undone.</p>',
      showCancelButton: true,
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#b91c1c',
    });
    if (!confirmed?.isConfirmed) return;

    setDeletingId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      g.notyf?.error(data.error ?? 'Failed to delete account');
      return;
    }
    setUsers((rows) => rows.filter((r) => r.id !== u.id));
  }

  if (restricted) {
    return (
      <div className="card bg-base-100 shadow p-6">
        <h2 className="text-xl font-bold mb-1">Admin Users</h2>
        <p className="text-sm text-base-content/80">
          Managing admin/HQ accounts is restricted to the portal owner's account, since it creates and removes login credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HelpPanel pageKey="admin_users" title="Admin Users — How it works">
        <ol className="list-decimal list-inside space-y-1">
          <li><strong>Add a user</strong> — click "Add Admin" and enter their name and email. They sign in with a magic link sent to that email — no password is set here.</li>
          <li><strong>Edit a user</strong> — click the edit icon to rename, change their email, or set a designation (shown in the navbar).</li>
          <li><strong>Delete a user</strong> — removes the account and signs them out immediately. This does not affect DEO accounts, which are managed on the District Master page.</li>
        </ol>
        <p className="mt-1 text-base-content/80">The owner (superadmin) account is shown read-only here — its sign-in email is fixed by server configuration.</p>
      </HelpPanel>

      <div className="card bg-base-100 shadow p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold">Admin Users</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Admin
          </button>
        </div>
        <p className="text-sm text-base-content/90 mb-4">
          Department officials who sign in via email magic link to browse and manage the admin/HQ portal.
        </p>

        <div className="overflow-x-auto">
          <table className="table table-sm w-full" role="grid" aria-label="Admin users table">
            <thead><tr><th>Name</th><th>Designation</th><th>Role</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }, (_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j}><div className="h-3 bg-base-300 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-base-content/60 py-6">No admin accounts yet.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} role="row">
                    <td className="font-medium">{u.name}</td>
                    <td>{u.designation ?? <span className="text-base-content/50">—</span>}</td>
                    <td>{u.isOwner ? <span className="badge badge-xs badge-primary">Owner</span> : <span className="badge badge-xs badge-ghost">Admin</span>}</td>
                    <td className="text-xs text-base-content/70">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="flex gap-1 justify-end">
                      <button className="btn btn-ghost btn-xs btn-circle" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                      </button>
                      {!u.isOwner && (
                        <button
                          className="btn btn-ghost btn-xs btn-circle text-error"
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                          aria-label={`Delete ${u.name}`}
                        >
                          {deletingId === u.id
                            ? <span className="loading loading-spinner loading-xs" />
                            : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditAdminUserDrawer
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}
