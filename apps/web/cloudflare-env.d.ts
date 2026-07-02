interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  API_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  SUPERADMIN_EMAIL_HASH: string;
}
