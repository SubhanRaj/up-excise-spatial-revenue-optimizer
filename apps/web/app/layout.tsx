import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'UP Excise Portal',
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
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})()`,
          }}
        />

        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.css" />

        <script src="https://cdn.jsdelivr.net/npm/tailwindcss@4.3.2/dist/lib.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js" />
        <script src="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.js" />

        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}`,
          }}
        />
      </body>
    </html>
  );
}
