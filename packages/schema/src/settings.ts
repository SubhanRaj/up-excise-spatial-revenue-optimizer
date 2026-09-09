import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Singleton row (id fixed at 1). verificationPhaseOpen is DORMANT as of M-104 — the
// state-wide "final verification round" gate was removed (a DEO now verifies their own
// district the moment it's 'submitted', no HQ toggle). The column is left in place rather
// than dropped (SQLite makes that awkward and nothing reads it now). If a new global flag
// is needed, add a column here — don't split into a second singleton table.
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  verificationPhaseOpen: integer('verification_phase_open', { mode: 'boolean' }).default(false).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});
