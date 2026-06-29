import type { NextConfig } from 'next';

const config: NextConfig = {
  // DaisyUI, Tailwind, Dexie, SweetAlert2, Notyf, SheetJS, Chart.js, Leaflet
  // are all loaded from jsDelivr CDN — never bundled here.
  serverExternalPackages: [],
};

export default config;
