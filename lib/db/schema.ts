import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  youtrackId: text("youtrack_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    scope: text("scope").notNull(),
    teamId: uuid("team_id"), // v3 placeholder, nullable
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
  }),
);
