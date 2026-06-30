import type { Metadata, Viewport } from 'next';
import ViewPrefsPanel from '@/app/_components/ViewPrefsPanel';

export const metadata: Metadata = {
  title: 'UP Excise Spatial Revenue Optimizer',
  description: 'State Excise Portal — Spatial & Revenue Optimization System',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Theme applied before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})()`,
          }}
        />

        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css" />
        {/* Government portal colour palette — navy primary, teal secondary, amber accent */}
        <style dangerouslySetInnerHTML={{ __html: `
          [data-theme="light"] {
            --color-primary: oklch(38% 0.14 243);
            --color-primary-content: oklch(97% 0.01 243);
            --color-secondary: oklch(46% 0.12 195);
            --color-secondary-content: oklch(97% 0.01 195);
            --color-accent: oklch(68% 0.16 72);
            --color-accent-content: oklch(15% 0.04 72);
          }
          [data-theme="dark"] {
            --color-primary: oklch(60% 0.16 243);
            --color-primary-content: oklch(10% 0.02 243);
            --color-secondary: oklch(58% 0.13 195);
            --color-secondary-content: oklch(10% 0.02 195);
            --color-accent: oklch(72% 0.16 72);
            --color-accent-content: oklch(15% 0.04 72);
          }
          [data-font-size="sm"] { font-size: 0.8125rem; }
          [data-font-size="lg"] { font-size: 0.9375rem; }
          [data-density="compact"] .table td, [data-density="compact"] .table th { padding: 0.2rem 0.5rem !important; }
          [data-density="spacious"] .table td, [data-density="spacious"] .table th { padding: 0.75rem 1rem !important; }
          [data-view-width="wide"] .admin-content { max-width: 100%; }
          [data-view-width="full"] .admin-content { max-width: 100%; padding-left: 0.5rem; padding-right: 0.5rem; }
          .leaflet-tooltip.district-map-label { background: transparent !important; border: none !important; box-shadow: none !important; font-size: 10px !important; font-weight: 700 !important; color: #1e293b !important; text-shadow: 0 0 4px #fff, 0 0 4px #fff, 0 0 4px #fff !important; padding: 0 !important; white-space: nowrap !important; pointer-events: none !important; }
          .leaflet-tooltip.district-map-label::before { display: none !important; }
          [data-theme="dark"] .leaflet-tooltip.district-map-label { color: #f1f5f9 !important; text-shadow: 0 0 4px #0f172a, 0 0 4px #0f172a, 0 0 4px #0f172a !important; }
        `}} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />

        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4" />
        <script src="https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js" />

        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        {children}
        <ViewPrefsPanel />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}`,
          }}
        />
      </body>
    </html>
  );
}
