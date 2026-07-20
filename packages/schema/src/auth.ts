import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const authUsers = sqliteTable('auth_users', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  emailHash:    text('email_hash').unique().notNull(),
  name:         text('name').notNull(),
  role:         text('role').notNull().default('deo'),  // 'deo' | 'admin'
  deoId:        text('deo_id'),
  districtName: text('district_name'),
  // SHA-256 of the DEO's 10-digit CUG mobile number, hashed in-browser — never the raw
  // number. Alternate credential to magic-link email, for when RESEND_FROM_EMAIL's domain
  // isn't verified yet and email delivery can't be relied on.
  deoCugHash:   text('deo_cug_hash').unique(),
  // Admin-only in practice (e.g. "Excise Commissioner") — shown in the admin navbar next to
  // the person's name. Null for DEOs, whose identity display is district-driven instead.
  designation:  text('designation'),
  createdAt:    text('created_at').default(sql`(datetime('now'))`),
});

export const authMagicLinks = sqliteTable('auth_magic_links', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  emailHash:  text('email_hash').notNull(),
  tokenHash:  text('token_hash').unique().notNull(),
  expiresAt:  text('expires_at').notNull(),
  used:       integer('used').notNull().default(0),
  createdAt:  text('created_at').default(sql`(datetime('now'))`),
});

export const authSessions = sqliteTable('auth_sessions', {
  id:       text('id').primaryKey(),  // sha256(rawId)
  userId:   integer('user_id').notNull().references(() => authUsers.id),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

export type AuthUser = typeof authUsers.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
