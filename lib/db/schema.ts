import { pgTable, uuid, text, timestamp, integer, numeric, boolean, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  youtrackId: text("youtrack_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Moderator's preferred default poker mode for new issues. Null → fall back to "advanced".
  defaultPokerMode: text("default_poker_mode"), // 'simple' | 'advanced'
  // Moderator's preferred default for whether duration estimation runs. Null → fall back to true.
  defaultWithEstimation: boolean("default_with_estimation"),
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
    // The YouTrack workspace this PAT is for. Null on legacy rows — those
    // fall back to env.YT_BASE_URL at read time.
    workspaceBaseUrl: text("workspace_base_url"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.provider] }),
  }),
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  boardId: text("board_id").notNull(),
  sprintId: text("sprint_id").notNull(),
  sprintName: text("sprint_name").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'ended'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  spField: text("sp_field"),
  durationField: text("duration_field"),
  doneStateNames: text("done_state_names").array(),
  candidates: jsonb("candidates"), // Array<{ youtrackId, login, name, fullName }> or null
  teamId: uuid("team_id"), // v3 placeholder
  // The YouTrack workspace this session was created against. Filled at create
  // time from the moderator's oauth_accounts.workspaceBaseUrl (or env fallback).
  // Default empty string keeps the column NOT NULL friendly for legacy rows
  // backfilled by the migration — in practice it's never read empty.
  workspaceBaseUrl: text("workspace_base_url").notNull().default(""),
});

export const sessionMembers = pgTable(
  "session_members",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role").notNull(), // 'moderator' | 'voter'
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    youtrackIssueId: text("youtrack_issue_id").notNull(),
    issueKey: text("issue_key").notNull(),
    summary: text("summary").notNull(),
    description: text("description"),
    position: integer("position").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    teamId: uuid("team_id"), // v3 placeholder
    // Per-issue poker mode. Null on legacy rows → treat as "advanced".
    pokerMode: text("poker_mode"), // 'simple' | 'advanced'
    // Per-issue duration toggle. Null on legacy rows → treat as true.
    withEstimation: boolean("with_estimation"),
    // True when the moderator typed values without running a vote.
    directEntry: boolean("direct_entry").notNull().default(false),
  },
  (t) => ({
    uniqInSession: uniqueIndex("issues_session_yt_uniq").on(t.sessionId, t.youtrackIssueId),
    bySession: index("issues_session_idx").on(t.sessionId),
  }),
);

export const estimates = pgTable("estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'sp' | 'duration'
  phase: text("phase"), // null for sp; 'impl' | 'review' | 'test'
  round: integer("round").notNull().default(1),
  finalValue: numeric("final_value"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateId: uuid("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    // Nullable: null = abstain ("no opinion") — voter is present but skipped.
    value: numeric("value"),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqUserPerEstimate: uniqueIndex("votes_estimate_user_uniq").on(t.estimateId, t.userId),
  }),
);

export const youtrackPosts = pgTable("youtrack_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'sp_field' | 'duration_field' | 'comment'
  requestPayload: jsonb("request_payload").notNull(),
  responsePayload: jsonb("response_payload"),
  status: text("status").notNull(), // 'success' | 'failed'
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});
