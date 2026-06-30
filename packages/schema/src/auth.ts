import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const authUsers = sqliteTable('auth_users', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  email:        text('email').unique().notNull(),
  name:         text('name').notNull(),
  role:         text('role').notNull().default('deo'),  // 'deo' | 'admin'
  deoId:        text('deo_id'),
  districtName: text('district_name'),
  createdAt:    text('created_at').default(sql`(datetime('now'))`),
});

export const authMagicLinks = sqliteTable('auth_magic_links', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  email:      text('email').notNull(),
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
