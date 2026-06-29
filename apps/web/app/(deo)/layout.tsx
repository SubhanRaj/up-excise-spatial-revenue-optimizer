import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'DEO Portal — UP Excise' };

export default function DeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base-200" data-theme="excise-light">
      {/* Connection status banner rendered client-side */}
      <div id="connection-banner" />
      <nav className="navbar bg-base-100 shadow-sm px-4">
        <div className="flex-1">
          <span className="text-lg font-semibold">UP Excise DEO Portal</span>
        </div>
        <div className="flex-none gap-2">
          <button id="theme-toggle" className="btn btn-ghost btn-circle" aria-label="Toggle theme">
            ☀️
          </button>
          <a href="/api/auth/signout" className="btn btn-ghost btn-sm">Sign out</a>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-6 md:px-8">
        {children}
      </main>
    </div>
  );
}
