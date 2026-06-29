import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'HQ Admin — UP Excise' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base-200">
      {/* Chart.js and Leaflet loaded here — admin route group only */}
      <head>
        <script
          src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"
          integrity="sha384-vsrfeLOOY6KuIYKDlmVH5UiBmgIdB1oEf7p01YgWHuqmOHfZr374+odEv96n9tNC"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
          crossOrigin="anonymous"
        />
        <script
          src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
          crossOrigin="anonymous"
        />
      </head>
      <nav className="navbar bg-base-100 shadow-sm px-4">
        <div className="flex-1">
          <span className="text-lg font-semibold">UP Excise — HQ Dashboard</span>
        </div>
        <div className="flex-none gap-2">
          <a href="/admin" className="btn btn-ghost btn-sm">Overview</a>
          <a href="/admin/provision" className="btn btn-ghost btn-sm">Provision DEOs</a>
          <a href="/admin/audit" className="btn btn-ghost btn-sm">Audit Log</a>
          <a href="/admin/export" className="btn btn-ghost btn-sm">Export</a>
          <a href="/api/auth/signout" className="btn btn-ghost btn-sm">Sign out</a>
        </div>
      </nav>
      <main className="container mx-auto px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
