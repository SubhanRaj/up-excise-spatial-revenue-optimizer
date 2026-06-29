import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'UP Excise Portal',
  description: 'State Excise Portal — Spatial & Revenue Optimization System',
  manifest: '/manifest.json',
  themeColor: '#1d4ed8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Theme applied before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='excise-dark'?'excise-dark':'excise-light');}catch(e){}})()`,
          }}
        />

        {/* DaisyUI 5.6.3 — semantic component classes, zero JS runtime */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/daisyui@5.6.3/daisyui.css"
          integrity="sha384-x+oMh8fmHEx+7aL8lcOSCd4orgj0dIKeC0O9R9vQM3gqvWLcdtDyOZa6ArFD2HXz"
          crossOrigin="anonymous"
        />

        {/* Notyf 3.10.0 CSS — toast notifications */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.css"
          integrity="sha384-snpJ3knpH6avB6cP1vPkNdmRzCYaCpom/3TNOyvo189BiogXYXQfXkyYpZ2/xADs"
          crossOrigin="anonymous"
        />

        {/* Tailwind Play CDN 3.4.17 — runtime utility generation, no PostCSS build step */}
        <script
          src="https://cdn.tailwindcss.com/3.4.17"
          integrity="sha384-igm5BeiBt36UU4gqwWS7imYmelpTsZlQ45FZf+XBn9MuJbn4nQr7yx1yFydocC/K"
          crossOrigin="anonymous"
        />

        {/* Dexie.js 4.0.10 — IndexedDB wrapper, offline-first staging layer */}
        <script
          src="https://cdn.jsdelivr.net/npm/dexie@4.0.10/dist/dexie.min.js"
          integrity="sha384-3VWLzUTczDc/wazaoH+b5qG4iME0duPONRO281rRiaFkfpV/b3w5uxrvod7rCHcW"
          crossOrigin="anonymous"
        />

        {/* SweetAlert2 11.14.5 — all modal alerts, confirms, prompts (replaces native alert/confirm) */}
        <script
          src="https://cdn.jsdelivr.net/npm/sweetalert2@11.14.5/dist/sweetalert2.all.min.js"
          integrity="sha384-YB/DdIkloKoRpclWB8bNcYXWakt57USgtQPDzvnIDHYU0lasD5eWlXVo1S4ODukY"
          crossOrigin="anonymous"
        />

        {/* Notyf 3.10.0 — side flash notifications */}
        <script
          src="https://cdn.jsdelivr.net/npm/notyf@3.10.0/notyf.min.js"
          integrity="sha384-uuNfwJfjOG2ukYi4eAB11/t3lP4Zjf75a3UhgkLzEpiX8JpJfacpG7Ye+0tiVMxT"
          crossOrigin="anonymous"
        />

        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}`,
          }}
        />
      </body>
    </html>
  );
}
