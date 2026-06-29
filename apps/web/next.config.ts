import type { NextConfig } from 'next';

const config: NextConfig = {
  // Required by @opennextjs/cloudflare — tells Next.js to build for the CF Workers runtime
  // All SSR, API routes, and middleware run inside the Worker via OpenNext
};

export default config;
