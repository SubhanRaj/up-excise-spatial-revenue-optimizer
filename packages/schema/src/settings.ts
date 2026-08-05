import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Singleton row (id fixed at 1) — a generic KV table would be overkill for one flag.
// verificationPhaseOpen gates the state-wide final-verification round (M-60): once true,
// every DEO whose district is 'submitted' sees a read-only final-review screen instead of
// the normal Circles/Upload/Verify workflow, and can either confirm (status -> 'verified')
// or request a data-correction unlock. Add more columns here if more global flags show up —
// don't split into a second singleton table for a second flag.
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  verificationPhaseOpen: integer('verification_phase_open', { mode: 'boolean' }).default(false).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});
