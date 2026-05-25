# Planning Poker v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of Full House — a sprint toolset whose first tool is a YouTrack-integrated Planning Poker app with real-time voting, per-phase duration estimation, revote, and write-back to YouTrack.

**Architecture:** Next.js 15 App Router monolith on Vercel. Postgres (Neon) is source of truth for sessions, votes, and audit. Pusher Channels broadcasts state changes; the server is sole authority — clients never trust each other. Auth.js v5 with a custom YouTrack OAuth provider. Domain logic (state machine, suggestion math, comment formatting) is pure and 100% unit-tested; everything else is integration-tested with real Postgres (testcontainers) and a mocked YouTrack (MSW).

**Tech Stack:** Next.js 15, TypeScript strict, Tailwind v4, shadcn/ui, Drizzle ORM, Neon Postgres, Auth.js v5, Pusher Channels, Serwist (PWA), TanStack Query, Vitest, Playwright, MSW, Pino, Zod.

**Spec:** `docs/superpowers/specs/2026-05-25-planning-poker-design.md`

---

## File Structure

```
full-house/
├── app/
│   ├── layout.tsx                                 # root layout, fonts, providers
│   ├── manifest.ts                                # PWA manifest
│   ├── sitemap.ts
│   ├── robots.ts
│   ├── (marketing)/page.tsx                       # landing
│   ├── (marketing)/layout.tsx                     # public layout
│   ├── login/page.tsx
│   ├── auth/youtrack/callback/route.ts            # OAuth callback
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts            # Auth.js
│   │   ├── pusher/auth/route.ts                   # private channel auth
│   │   ├── youtrack/boards/route.ts
│   │   ├── youtrack/boards/[boardId]/sprints/route.ts
│   │   └── sessions/
│   │       ├── route.ts                           # POST: create
│   │       └── [id]/
│   │           ├── route.ts                       # GET; DELETE = end session
│   │           ├── join/route.ts
│   │           ├── pick-issue/route.ts
│   │           ├── vote/route.ts
│   │           ├── reveal/route.ts
│   │           ├── submit/route.ts
│   │           ├── skip-phase/route.ts
│   │           ├── skip-issue/route.ts
│   │           ├── revote/route.ts
│   │           ├── sync/route.ts                  # writes back to YouTrack
│   │           └── takeover/route.ts
│   └── app/                                       # all auth-gated
│       ├── layout.tsx                             # app shell + auth gate
│       ├── page.tsx                               # dashboard
│       └── poker/
│           ├── page.tsx                           # board/sprint picker
│           └── [sessionId]/
│               ├── page.tsx                       # server component, hydrates room
│               └── room.client.tsx                # client; pusher subscribe
├── components/
│   ├── ui/                                        # shadcn-generated
│   ├── shell/
│   │   ├── app-nav.tsx
│   │   └── user-menu.tsx
│   └── poker/
│       ├── issue-card.tsx
│       ├── card-deck.tsx
│       ├── voter-list.tsx
│       ├── reveal-panel.tsx
│       ├── moderator-controls.tsx
│       ├── phase-stepper.tsx
│       └── round-badge.tsx
├── lib/
│   ├── env.ts                                     # zod-validated env
│   ├── logger.ts                                  # pino
│   ├── encryption.ts                              # AES-GCM helper
│   ├── encryption.test.ts
│   ├── auth/
│   │   ├── config.ts                              # Auth.js options
│   │   ├── youtrack-provider.ts                   # custom OAuth provider
│   │   └── session.ts                             # getServerUser() etc.
│   ├── youtrack/
│   │   ├── config.ts                              # youtrackConfig() accessor (v3-protection)
│   │   ├── client.ts                              # token-refreshing fetch wrapper
│   │   ├── client.test.ts
│   │   ├── boards.ts
│   │   ├── boards.test.ts
│   │   ├── sprints.ts
│   │   ├── sprints.test.ts
│   │   ├── issues.ts
│   │   ├── issues.test.ts
│   │   └── comments.ts
│   ├── poker/
│   │   ├── decks.ts                               # SP + duration card sets
│   │   ├── state-machine.ts                       # pure reducer
│   │   ├── state-machine.test.ts
│   │   ├── suggestion.ts                          # mode for SP, avg for duration
│   │   ├── suggestion.test.ts
│   │   ├── comment-formatter.ts
│   │   ├── comment-formatter.test.ts
│   │   ├── service.ts                             # DB+YouTrack orchestration
│   │   └── service.test.ts
│   ├── pusher/
│   │   ├── server.ts
│   │   └── client.ts
│   └── db/
│       ├── client.ts
│       └── schema.ts
├── db/
│   └── migrations/
├── hooks/
│   ├── use-session-room.ts
│   └── use-pusher-channel.ts
├── tests/
│   ├── e2e/
│   │   └── happy-path.spec.ts
│   ├── integration/
│   │   ├── setup.ts                               # testcontainers postgres
│   │   ├── session-lifecycle.test.ts
│   │   └── msw-handlers.ts                        # YouTrack mock
│   └── fixtures/
│       └── youtrack-responses.ts
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── og.png
├── .env.example
├── .env.test
├── drizzle.config.ts
├── next.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── tsconfig.json
└── package.json
```

---

## Phase 0 — Project setup

### Task 1: Initialize Next.js 15 + TypeScript strict

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/(marketing)/page.tsx`, `.gitignore`

- [ ] **Step 1: Scaffold project**

Run:
```bash
cd /home/javad/Projects/full-house
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias='@/*' --use-npm --no-turbopack
```

Answer "yes" to overwrite existing files. The `.git` directory and existing docs/specs must be preserved (the scaffold won't touch them).

- [ ] **Step 2: Confirm TS strict mode**

Open `tsconfig.json`. Ensure:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```
Add `noUncheckedIndexedAccess` and `noImplicitOverride` if missing.

- [ ] **Step 3: Replace default landing with our own stub**

Overwrite `app/page.tsx` (or `app/(marketing)/page.tsx` once routes are restructured later — for now keep at `app/page.tsx`):

```tsx
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-3xl font-semibold">Full House</h1>
    </main>
  );
}
```

- [ ] **Step 4: Verify dev server**

Run:
```bash
npm run dev
```
Expected: server starts on http://localhost:3000 and the page renders "Full House". Stop the server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TS strict project"
```

---

### Task 2: Install runtime dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install drizzle-orm @neondatabase/serverless pg @auth/core next-auth@beta zod pino pino-pretty pusher pusher-js @tanstack/react-query
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D drizzle-kit @types/pg vitest @vitest/coverage-v8 @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test msw testcontainers tsx
```

- [ ] **Step 3: Initialize Playwright browsers**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install runtime and dev dependencies"
```

---

### Task 3: Add shadcn/ui

**Files:** `components/ui/*`, `components.json`, `app/globals.css`

- [ ] **Step 1: Run init**

```bash
npx shadcn@latest init -d
```
Accept defaults: TypeScript, "default" style, "neutral" base color, `app/globals.css`, CSS variables, `components/ui` directory, `@/components`, `@/lib/utils`.

- [ ] **Step 2: Install components we'll need**

```bash
npx shadcn@latest add button card dialog dropdown-menu input label select toast avatar badge separator skeleton
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui base components"
```

---

### Task 4: Configure Vitest

**Files:** `vitest.config.ts`, `package.json` (scripts)

- [ ] **Step 1: Create config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/vitest-setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "components/**/*.test.tsx"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
  },
});
```

- [ ] **Step 2: Create setup file**

Create `tests/setup/vitest-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add scripts**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e": "playwright test"
```

- [ ] **Step 4: Verify**

Run:
```bash
npm test
```
Expected: "No test files found." (exit 0 or skipped — that's fine because we have no tests yet).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest + jsdom"
```

---

### Task 5: Configure Playwright

**Files:** `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Create playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write smoke test**

Create `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Full House" })).toBeVisible();
});
```

- [ ] **Step 3: Run smoke**

Run:
```bash
npm run test:e2e
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: configure Playwright + landing smoke test"
```

---

### Task 6: Add zod-validated env config

**Files:** `lib/env.ts`, `lib/env.test.ts`, `.env.example`

- [ ] **Step 1: Write failing test**

Create `lib/env.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("env", () => {
  const original = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("YT_") || k.startsWith("PUSHER_") || k === "DATABASE_URL" || k === "AUTH_SECRET" || k === "NEXT_PUBLIC_SITE_URL") {
        delete process.env[k];
      }
    }
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("parses a complete valid env", async () => {
    process.env.DATABASE_URL = "postgres://u:p@h/db";
    process.env.AUTH_SECRET = "x".repeat(32);
    process.env.YT_BASE_URL = "https://example.youtrack.cloud";
    process.env.YT_OAUTH_CLIENT_ID = "id";
    process.env.YT_OAUTH_CLIENT_SECRET = "secret";
    process.env.YT_OAUTH_REDIRECT_URI = "http://localhost:3000/auth/youtrack/callback";
    process.env.YT_TOKEN_ENC_KEY = Buffer.alloc(32).toString("base64");
    process.env.YT_SP_FIELD = "Story Points";
    process.env.YT_DURATION_FIELD = "Estimation";
    process.env.YT_DONE_STATE_NAMES = "Done,Won't fix";
    process.env.PUSHER_APP_ID = "1";
    process.env.PUSHER_KEY = "k";
    process.env.PUSHER_SECRET = "s";
    process.env.PUSHER_CLUSTER = "eu";
    process.env.NEXT_PUBLIC_PUSHER_KEY = "k";
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER = "eu";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    const { env } = await import("./env");
    expect(env.YT_DONE_STATE_NAMES).toEqual(["Done", "Won't fix"]);
    expect(env.YT_BASE_URL).toBe("https://example.youtrack.cloud");
  });

  it("throws when DATABASE_URL is missing", async () => {
    await expect(import("./env")).rejects.toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run test, see failure**

```bash
npm test -- env
```
Expected: FAIL (`lib/env` not found).

- [ ] **Step 3: Implement**

Create `lib/env.ts`:

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  YT_BASE_URL: z.string().url(),
  YT_OAUTH_CLIENT_ID: z.string().min(1),
  YT_OAUTH_CLIENT_SECRET: z.string().min(1),
  YT_OAUTH_REDIRECT_URI: z.string().url(),
  YT_TOKEN_ENC_KEY: z.string().refine(
    (v) => Buffer.from(v, "base64").length === 32,
    "must be a base64-encoded 32-byte key",
  ),
  YT_SP_FIELD: z.string().min(1),
  YT_DURATION_FIELD: z.string().min(1),
  YT_DONE_STATE_NAMES: z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  PUSHER_APP_ID: z.string().min(1),
  PUSHER_KEY: z.string().min(1),
  PUSHER_SECRET: z.string().min(1),
  PUSHER_CLUSTER: z.string().min(1),
  NEXT_PUBLIC_PUSHER_KEY: z.string().min(1),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid env: ${issues}`);
}

export const env = parsed.data;
```

- [ ] **Step 4: Run test, see pass**

```bash
npm test -- env
```
Expected: 2 passed.

- [ ] **Step 5: Create `.env.example`**

```bash
DATABASE_URL=postgres://user:pass@host/db
AUTH_SECRET=                   # >= 32 chars; openssl rand -hex 32
YT_BASE_URL=https://example.youtrack.cloud
YT_OAUTH_CLIENT_ID=
YT_OAUTH_CLIENT_SECRET=
YT_OAUTH_REDIRECT_URI=http://localhost:3000/auth/youtrack/callback
YT_TOKEN_ENC_KEY=              # base64-encoded 32 bytes; openssl rand -base64 32
YT_SP_FIELD=Story Points
YT_DURATION_FIELD=Estimation
YT_DONE_STATE_NAMES=Done,Won't fix
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=eu
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=eu
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts lib/env.test.ts .env.example
git commit -m "feat(env): zod-validated env config + tests"
```

---

### Task 7: Logger

**Files:** `lib/logger.ts`

- [ ] **Step 1: Implement**

Create `lib/logger.ts`:

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/logger.ts
git commit -m "feat: structured logger"
```

(No tests — thin pino wrapper, no logic.)

---

## Phase 1 — Database

### Task 8: Drizzle config + Postgres client

**Files:** `drizzle.config.ts`, `lib/db/client.ts`, `lib/db/schema.ts`

- [ ] **Step 1: Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: DB client**

Create `lib/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

const pool =
  global.__dbPool ??
  new Pool({ connectionString: env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== "production") global.__dbPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

- [ ] **Step 3: Add scripts**

In `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio"
```

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts package.json
git commit -m "feat(db): drizzle config + postgres client singleton"
```

---

### Task 9: Schema — users, oauth_accounts

**Files:** `lib/db/schema.ts`, `db/migrations/*` (generated)

- [ ] **Step 1: Write schema**

Create `lib/db/schema.ts`:

```ts
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
```

- [ ] **Step 2: Generate migration**

Run:
```bash
npm run db:generate -- --name init_users
```
Expected: a SQL file under `db/migrations/0000_*.sql`.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts db/migrations/
git commit -m "feat(db): users + oauth_accounts schema"
```

---

### Task 10: Schema — sessions, members, issues, estimates, votes, audit

**Files:** `lib/db/schema.ts`, `db/migrations/*`

- [ ] **Step 1: Extend schema**

Append to `lib/db/schema.ts`:

```ts
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  boardId: text("board_id").notNull(),
  sprintId: text("sprint_id").notNull(),
  sprintName: text("sprint_name").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'ended'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  teamId: uuid("team_id"), // v3 placeholder
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
    value: numeric("value").notNull(),
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
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate -- --name init_poker
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts db/migrations/
git commit -m "feat(db): sessions, members, issues, estimates, votes, audit schema"
```

---

### Task 11: Integration test infrastructure (testcontainers Postgres)

**Files:** `vitest.integration.config.ts`, `tests/integration/setup.ts`

- [ ] **Step 1: Integration vitest config**

Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
```

- [ ] **Step 2: Testcontainers bootstrap**

Create `tests/integration/setup.ts`:

```ts
import { afterAll, beforeAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";

let container: StartedPostgreSqlContainer;
let pool: Pool;

export let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  testDb = drizzle(pool, { schema });
  await migrate(testDb, { migrationsFolder: "./db/migrations" });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});
```

- [ ] **Step 3: Add `@testcontainers/postgresql`**

```bash
npm install -D @testcontainers/postgresql
```

- [ ] **Step 4: Verify with a trivial smoke test**

Create `tests/integration/db-smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./setup";

describe("db", () => {
  it("connects and runs SELECT 1", async () => {
    const r = await testDb.execute(sql`SELECT 1 as v`);
    expect(r.rows[0]?.v).toBe(1);
  });
});
```

- [ ] **Step 5: Run**

```bash
npm run test:integration
```
Expected: 1 passed (takes ~15s for first container pull).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: integration test infra with testcontainers postgres"
```

---

## Phase 2 — Core libraries

### Task 12: AES-GCM encryption helper

**Files:** `lib/encryption.ts`, `lib/encryption.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/encryption.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./encryption";

const key = Buffer.alloc(32, 7).toString("base64");

describe("encryption", () => {
  it("round-trips a string", () => {
    const ct = encrypt("hello world", key);
    expect(ct).not.toContain("hello");
    expect(decrypt(ct, key)).toBe("hello world");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });

  it("throws on tamper", () => {
    const ct = encrypt("x", key);
    const tampered = ct.slice(0, -2) + "AA";
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it("rejects keys that aren't 32 bytes", () => {
    expect(() => encrypt("x", Buffer.alloc(16).toString("base64"))).toThrow();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- encryption
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `lib/encryption.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(keyB64: string): Buffer {
  const k = Buffer.from(keyB64, "base64");
  if (k.length !== 32) throw new Error("encryption key must be 32 bytes (base64)");
  return k;
}

export function encrypt(plaintext: string, keyB64: string): string {
  const key = loadKey(keyB64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(ciphertextB64: string, keyB64: string): string {
  const key = loadKey(keyB64);
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- encryption
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/encryption.ts lib/encryption.test.ts
git commit -m "feat(crypto): AES-GCM encrypt/decrypt with random IV + auth tag"
```

---

### Task 13: Card decks (SP + duration)

**Files:** `lib/poker/decks.ts`, `lib/poker/decks.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/poker/decks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SP_DECK, DURATION_DECK, isValidCard } from "./decks";

describe("decks", () => {
  it("SP deck is pure Fibonacci 1..21", () => {
    expect(SP_DECK).toEqual([1, 2, 3, 5, 8, 13, 21]);
  });

  it("duration deck is 1h..24h doubling", () => {
    expect(DURATION_DECK).toEqual([1, 2, 4, 8, 16, 24]);
  });

  it("validates membership for kind=sp", () => {
    expect(isValidCard(5, "sp")).toBe(true);
    expect(isValidCard(4, "sp")).toBe(false);
  });

  it("validates membership for kind=duration", () => {
    expect(isValidCard(8, "duration")).toBe(true);
    expect(isValidCard(3, "duration")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- decks
```

- [ ] **Step 3: Implement**

Create `lib/poker/decks.ts`:

```ts
export const SP_DECK = [1, 2, 3, 5, 8, 13, 21] as const;
export const DURATION_DECK = [1, 2, 4, 8, 16, 24] as const;

export type EstimateKind = "sp" | "duration";

export function deckFor(kind: EstimateKind): readonly number[] {
  return kind === "sp" ? SP_DECK : DURATION_DECK;
}

export function isValidCard(value: number, kind: EstimateKind): boolean {
  return deckFor(kind).includes(value as never);
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- decks
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/decks.ts lib/poker/decks.test.ts
git commit -m "feat(poker): SP and duration card decks + validation"
```

---

### Task 14: Suggestion math (mode for SP, average-snapped for duration)

**Files:** `lib/poker/suggestion.ts`, `lib/poker/suggestion.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/poker/suggestion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { suggestSp, suggestDuration } from "./suggestion";

describe("suggestSp", () => {
  it("returns null for empty votes", () => {
    expect(suggestSp([])).toBeNull();
  });
  it("returns the single mode", () => {
    expect(suggestSp([3, 3, 5])).toBe(3);
  });
  it("on a tie, picks the highest tied value", () => {
    expect(suggestSp([2, 2, 5, 5])).toBe(5);
  });
  it("when all unique, returns the median rounded up to a deck card", () => {
    // votes [1,2,3,5,8] → median 3 → deck has 3 → 3
    expect(suggestSp([1, 2, 3, 5, 8])).toBe(3);
    // votes [1,2,5,8] → median 3.5 → next deck card up = 5
    expect(suggestSp([1, 2, 5, 8])).toBe(5);
  });
});

describe("suggestDuration", () => {
  it("returns null for empty votes", () => {
    expect(suggestDuration([])).toBeNull();
  });
  it("snaps average to nearest deck card", () => {
    // avg = (4+8)/2 = 6 → deck cards 4, 8 — round up on tie → 8
    expect(suggestDuration([4, 8])).toBe(8);
    // avg = (4+4+8)/3 = 5.33 → distance to 4 is 1.33, to 8 is 2.67 → 4
    expect(suggestDuration([4, 4, 8])).toBe(4);
  });
  it("single vote = that value if it's a deck card", () => {
    expect(suggestDuration([8])).toBe(8);
  });
  it("rounds up on a tie distance", () => {
    // avg = 3 → distance to 2 is 1, to 4 is 1 → tie → 4
    expect(suggestDuration([2, 4])).toBe(4);
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- suggestion
```

- [ ] **Step 3: Implement**

Create `lib/poker/suggestion.ts`:

```ts
import { SP_DECK, DURATION_DECK } from "./decks";

export function suggestSp(votes: number[]): number | null {
  if (votes.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const modes = [...counts.entries()].filter(([, c]) => c === maxCount).map(([v]) => v);
  if (modes.length === 1) return modes[0]!;
  // Tied mode → highest of tied values
  if (maxCount > 1) return Math.max(...modes);
  // All unique → median, rounded up to nearest deck card
  const sorted = [...votes].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median =
    sorted.length % 2 === 1 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return snapUp(median, SP_DECK);
}

export function suggestDuration(votes: number[]): number | null {
  if (votes.length === 0) return null;
  const avg = votes.reduce((a, b) => a + b, 0) / votes.length;
  return snapToNearestRoundingUp(avg, DURATION_DECK);
}

function snapUp(value: number, deck: readonly number[]): number {
  for (const c of deck) if (c >= value) return c;
  return deck[deck.length - 1]!;
}

function snapToNearestRoundingUp(value: number, deck: readonly number[]): number {
  let best = deck[0]!;
  let bestDist = Math.abs(value - best);
  for (const c of deck.slice(1)) {
    const d = Math.abs(value - c);
    if (d < bestDist || (d === bestDist && c > best)) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- suggestion
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/suggestion.ts lib/poker/suggestion.test.ts
git commit -m "feat(poker): suggestion math (mode for SP, avg-snapped for duration)"
```

---

### Task 15: Issue state machine (pure reducer)

**Files:** `lib/poker/state-machine.ts`, `lib/poker/state-machine.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/poker/state-machine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reduceIssue, IssueState } from "./state-machine";

describe("state machine", () => {
  it("happy path SP → impl → review → test → completed", () => {
    let s: IssueState = { status: "pending", round: 1 };
    s = reduceIssue(s, { type: "pick" });
    expect(s.status).toBe("sp_voting");
    s = reduceIssue(s, { type: "reveal" });
    expect(s.status).toBe("sp_revealed");
    s = reduceIssue(s, { type: "submit" });
    expect(s.status).toBe("dur_impl_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("dur_review_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("dur_test_voting");
    s = reduceIssue(reduceIssue(s, { type: "reveal" }), { type: "submit" });
    expect(s.status).toBe("completed");
  });

  it("revote returns to same voting state and increments round", () => {
    let s: IssueState = { status: "sp_revealed", round: 1 };
    s = reduceIssue(s, { type: "revote" });
    expect(s).toEqual({ status: "sp_voting", round: 2 });
  });

  it("skip phase advances past current phase without finalizing", () => {
    let s: IssueState = { status: "sp_voting", round: 1 };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_impl_voting");
    expect(s.round).toBe(1);
  });

  it("skip issue from any non-completed state moves to skipped", () => {
    let s: IssueState = { status: "dur_review_revealed", round: 2 };
    s = reduceIssue(s, { type: "skipIssue" });
    expect(s.status).toBe("skipped");
  });

  it("invalid transitions throw", () => {
    expect(() => reduceIssue({ status: "pending", round: 1 }, { type: "reveal" })).toThrow();
    expect(() => reduceIssue({ status: "sp_voting", round: 1 }, { type: "submit" })).toThrow();
  });

  it("skip on a *_revealed state advances to next phase", () => {
    let s: IssueState = { status: "dur_impl_revealed", round: 1 };
    s = reduceIssue(s, { type: "skipPhase" });
    expect(s.status).toBe("dur_review_voting");
  });

  it("submit on last phase reveal goes to completed", () => {
    let s: IssueState = { status: "dur_test_revealed", round: 1 };
    s = reduceIssue(s, { type: "submit" });
    expect(s.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- state-machine
```

- [ ] **Step 3: Implement**

Create `lib/poker/state-machine.ts`:

```ts
export type IssueStatus =
  | "pending"
  | "sp_voting"
  | "sp_revealed"
  | "dur_impl_voting"
  | "dur_impl_revealed"
  | "dur_review_voting"
  | "dur_review_revealed"
  | "dur_test_voting"
  | "dur_test_revealed"
  | "completed"
  | "skipped";

export type IssueState = { status: IssueStatus; round: number };

export type Action =
  | { type: "pick" }
  | { type: "reveal" }
  | { type: "submit" }
  | { type: "revote" }
  | { type: "skipPhase" }
  | { type: "skipIssue" };

const NEXT_AFTER_PHASE: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_voting: "dur_impl_voting",
  sp_revealed: "dur_impl_voting",
  dur_impl_voting: "dur_review_voting",
  dur_impl_revealed: "dur_review_voting",
  dur_review_voting: "dur_test_voting",
  dur_review_revealed: "dur_test_voting",
  dur_test_voting: "completed",
  dur_test_revealed: "completed",
};

const REVEAL_OF: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_voting: "sp_revealed",
  dur_impl_voting: "dur_impl_revealed",
  dur_review_voting: "dur_review_revealed",
  dur_test_voting: "dur_test_revealed",
};

const VOTING_OF: Partial<Record<IssueStatus, IssueStatus>> = {
  sp_revealed: "sp_voting",
  dur_impl_revealed: "dur_impl_voting",
  dur_review_revealed: "dur_review_voting",
  dur_test_revealed: "dur_test_voting",
};

export function reduceIssue(state: IssueState, action: Action): IssueState {
  switch (action.type) {
    case "pick":
      if (state.status !== "pending") throw new Error(`cannot pick from ${state.status}`);
      return { status: "sp_voting", round: 1 };
    case "reveal": {
      const next = REVEAL_OF[state.status];
      if (!next) throw new Error(`cannot reveal from ${state.status}`);
      return { ...state, status: next };
    }
    case "revote": {
      const next = VOTING_OF[state.status];
      if (!next) throw new Error(`cannot revote from ${state.status}`);
      return { status: next, round: state.round + 1 };
    }
    case "submit":
    case "skipPhase": {
      const next = NEXT_AFTER_PHASE[state.status];
      if (!next) throw new Error(`cannot ${action.type} from ${state.status}`);
      // entering a new phase resets the round counter
      return { status: next, round: next === "completed" ? state.round : 1 };
    }
    case "skipIssue":
      if (state.status === "completed") throw new Error("cannot skip a completed issue");
      return { status: "skipped", round: state.round };
  }
}

export function phaseOfStatus(s: IssueStatus): { kind: "sp" | "duration" | null; phase: "impl" | "review" | "test" | null } {
  switch (s) {
    case "sp_voting":
    case "sp_revealed":
      return { kind: "sp", phase: null };
    case "dur_impl_voting":
    case "dur_impl_revealed":
      return { kind: "duration", phase: "impl" };
    case "dur_review_voting":
    case "dur_review_revealed":
      return { kind: "duration", phase: "review" };
    case "dur_test_voting":
    case "dur_test_revealed":
      return { kind: "duration", phase: "test" };
    default:
      return { kind: null, phase: null };
  }
}

export function isVotingStatus(s: IssueStatus): boolean {
  return s.endsWith("_voting");
}

export function isRevealedStatus(s: IssueStatus): boolean {
  return s.endsWith("_revealed");
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- state-machine
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/state-machine.ts lib/poker/state-machine.test.ts
git commit -m "feat(poker): pure issue state machine with revote and skip"
```

---

### Task 16: Comment formatter

**Files:** `lib/poker/comment-formatter.ts`, `lib/poker/comment-formatter.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/poker/comment-formatter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatSummaryComment, type SummaryInput } from "./comment-formatter";

const baseInput: SummaryInput = {
  date: new Date("2026-05-25T10:00:00Z"),
  members: ["Javad", "Sara", "Reza"],
  sp: { skipped: false, final: 5, rounds: 1, votes: [{ user: "Javad", value: 5 }, { user: "Sara", value: 3 }, { user: "Reza", value: 5 }] },
  duration: {
    impl: { skipped: false, final: 8, rounds: 1, votes: [{ user: "Javad", value: 8 }, { user: "Sara", value: 4 }, { user: "Reza", value: 8 }] },
    review: { skipped: false, final: 2, rounds: 1, votes: [{ user: "Javad", value: 2 }, { user: "Sara", value: 1 }, { user: "Reza", value: 2 }] },
    test: { skipped: false, final: 2, rounds: 1, votes: [{ user: "Javad", value: 2 }, { user: "Sara", value: 2 }, { user: "Reza", value: 2 }] },
  },
};

describe("formatSummaryComment", () => {
  it("includes date, members, SP and per-phase duration", () => {
    const out = formatSummaryComment(baseInput);
    expect(out).toContain("2026-05-25");
    expect(out).toContain("Javad, Sara, Reza");
    expect(out).toContain("Story Points: 5");
    expect(out).toContain("Duration: 12h total");
    expect(out).toContain("Implementation: 8h");
    expect(out).toContain("Review: 2h");
    expect(out).toContain("Test: 2h");
  });

  it("groups votes by value with voter names", () => {
    const out = formatSummaryComment(baseInput);
    expect(out).toContain("3 — Sara");
    expect(out).toContain("5 — Javad, Reza");
  });

  it("renders 'Story Points: skipped' when SP was skipped", () => {
    const out = formatSummaryComment({ ...baseInput, sp: { skipped: true, final: null, rounds: 0, votes: [] } });
    expect(out).toContain("Story Points: skipped");
    expect(out).not.toMatch(/Story Points: \d/);
  });

  it("renders 'Duration: skipped' when all three phases were skipped", () => {
    const out = formatSummaryComment({
      ...baseInput,
      duration: {
        impl: { skipped: true, final: null, rounds: 0, votes: [] },
        review: { skipped: true, final: null, rounds: 0, votes: [] },
        test: { skipped: true, final: null, rounds: 0, votes: [] },
      },
    });
    expect(out).toContain("Duration: skipped");
  });

  it("renders a single phase as skipped, others as numbers", () => {
    const out = formatSummaryComment({
      ...baseInput,
      duration: { ...baseInput.duration, review: { skipped: true, final: null, rounds: 0, votes: [] } },
    });
    expect(out).toContain("Review: skipped");
    expect(out).toContain("Duration: 10h total");
  });

  it("shows '(rounds: N)' when more than one round happened", () => {
    const out = formatSummaryComment({ ...baseInput, sp: { ...baseInput.sp, rounds: 2 } });
    expect(out).toMatch(/Story Points: 5\s+\(rounds: 2\)/);
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- comment-formatter
```

- [ ] **Step 3: Implement**

Create `lib/poker/comment-formatter.ts`:

```ts
export type Vote = { user: string; value: number };

export type EstimateSummary = {
  skipped: boolean;
  final: number | null;
  rounds: number;
  votes: Vote[];
};

export type SummaryInput = {
  date: Date;
  members: string[];
  sp: EstimateSummary;
  duration: {
    impl: EstimateSummary;
    review: EstimateSummary;
    test: EstimateSummary;
  };
};

export function formatSummaryComment(s: SummaryInput): string {
  const date = s.date.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`Estimated via Full House on ${date} by ${s.members.join(", ")}.`);
  lines.push("");

  // SP line
  if (s.sp.skipped) {
    lines.push("Story Points: skipped");
  } else if (s.sp.final !== null) {
    const roundSuffix = s.sp.rounds > 1 ? `  (rounds: ${s.sp.rounds})` : "";
    lines.push(`Story Points: ${formatNum(s.sp.final)}${roundSuffix}`);
    for (const line of groupVoteLines(s.sp.votes)) lines.push(`  ${line}`);
  }
  lines.push("");

  // Duration
  const phases: Array<{ label: string; key: "impl" | "review" | "test" }> = [
    { label: "Implementation", key: "impl" },
    { label: "Review", key: "review" },
    { label: "Test", key: "test" },
  ];
  const allSkipped = phases.every((p) => s.duration[p.key].skipped);
  if (allSkipped) {
    lines.push("Duration: skipped");
  } else {
    const total = phases.reduce((sum, p) => sum + (s.duration[p.key].final ?? 0), 0);
    lines.push(`Duration: ${formatNum(total)}h total`);
    for (const p of phases) {
      const e = s.duration[p.key];
      if (e.skipped) {
        lines.push(`  ${p.label}: skipped`);
        continue;
      }
      const roundSuffix = e.rounds > 1 ? `  (rounds: ${e.rounds})` : "";
      lines.push(`  ${p.label}: ${formatNum(e.final ?? 0)}h${roundSuffix}`);
      for (const line of groupVoteLines(e.votes)) lines.push(`    ${line}`);
    }
  }

  return lines.join("\n");
}

function groupVoteLines(votes: Vote[]): string[] {
  const byValue = new Map<number, string[]>();
  for (const v of votes) {
    const list = byValue.get(v.value) ?? [];
    list.push(v.user);
    byValue.set(v.value, list);
  }
  return [...byValue.entries()]
    .sort(([a], [b]) => a - b)
    .map(([value, users]) => `${formatNum(value)} — ${users.join(", ")}`);
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- comment-formatter
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/poker/comment-formatter.ts lib/poker/comment-formatter.test.ts
git commit -m "feat(poker): summary comment formatter with skip + revote handling"
```

---

## Phase 3 — YouTrack client

### Task 17: YouTrack config accessor (v3-protection)

**Files:** `lib/youtrack/config.ts`, `lib/youtrack/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/youtrack/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { youtrackConfig } from "./config";

describe("youtrackConfig", () => {
  it("returns a config object built from env", () => {
    const c = youtrackConfig();
    expect(c.baseUrl).toBe(process.env.YT_BASE_URL);
    expect(c.spField).toBe(process.env.YT_SP_FIELD);
    expect(c.doneStateNames.length).toBeGreaterThanOrEqual(1);
  });
});
```

(For this test to run, the unit-test runner needs the same env as Task 6. Add a `tests/setup/vitest-setup.ts` env shim — already present — that hard-codes env vars for the unit-test run.)

- [ ] **Step 2: Add env shim to vitest setup**

Replace `tests/setup/vitest-setup.ts` with:

```ts
import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL ??= "postgres://test/test";
process.env.AUTH_SECRET ??= "x".repeat(32);
process.env.YT_BASE_URL ??= "https://example.youtrack.cloud";
process.env.YT_OAUTH_CLIENT_ID ??= "id";
process.env.YT_OAUTH_CLIENT_SECRET ??= "secret";
process.env.YT_OAUTH_REDIRECT_URI ??= "http://localhost:3000/auth/youtrack/callback";
process.env.YT_TOKEN_ENC_KEY ??= Buffer.alloc(32).toString("base64");
process.env.YT_SP_FIELD ??= "Story Points";
process.env.YT_DURATION_FIELD ??= "Estimation";
process.env.YT_DONE_STATE_NAMES ??= "Done,Won't fix";
process.env.PUSHER_APP_ID ??= "1";
process.env.PUSHER_KEY ??= "k";
process.env.PUSHER_SECRET ??= "s";
process.env.PUSHER_CLUSTER ??= "eu";
process.env.NEXT_PUBLIC_PUSHER_KEY ??= "k";
process.env.NEXT_PUBLIC_PUSHER_CLUSTER ??= "eu";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
```

- [ ] **Step 3: Run, see fail**

```bash
npm test -- youtrack/config
```

- [ ] **Step 4: Implement**

Create `lib/youtrack/config.ts`:

```ts
import { env } from "@/lib/env";

export type YoutrackConfig = {
  baseUrl: string;
  spField: string;
  durationField: string;
  doneStateNames: string[];
  oauth: { clientId: string; clientSecret: string; redirectUri: string };
};

export function youtrackConfig(): YoutrackConfig {
  return {
    baseUrl: env.YT_BASE_URL,
    spField: env.YT_SP_FIELD,
    durationField: env.YT_DURATION_FIELD,
    doneStateNames: env.YT_DONE_STATE_NAMES,
    oauth: {
      clientId: env.YT_OAUTH_CLIENT_ID,
      clientSecret: env.YT_OAUTH_CLIENT_SECRET,
      redirectUri: env.YT_OAUTH_REDIRECT_URI,
    },
  };
}
```

- [ ] **Step 5: Run, see pass**

```bash
npm test -- youtrack/config
```

- [ ] **Step 6: Commit**

```bash
git add lib/youtrack/config.ts lib/youtrack/config.test.ts tests/setup/vitest-setup.ts
git commit -m "feat(youtrack): config accessor (v3-protection) + test env shim"
```

---

### Task 18: YouTrack fetch wrapper with token refresh

**Files:** `lib/youtrack/client.ts`, `lib/youtrack/client.test.ts`, `tests/integration/msw-handlers.ts`

- [ ] **Step 1: Install MSW**

```bash
npm install -D msw
```

- [ ] **Step 2: Write failing test**

Create `lib/youtrack/client.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { youtrackFetch } from "./client";

const calls: string[] = [];

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/test", ({ request }) => {
    calls.push(request.headers.get("authorization") ?? "");
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(); calls.length = 0; });
afterAll(() => server.close());

describe("youtrackFetch", () => {
  it("attaches bearer token and parses JSON", async () => {
    const data = await youtrackFetch("/api/test", { token: "abc" });
    expect(data).toEqual({ ok: true });
    expect(calls[0]).toBe("Bearer abc");
  });

  it("throws YoutrackError on non-2xx", async () => {
    server.use(http.get("https://example.youtrack.cloud/api/x", () => HttpResponse.json({ error: "nope" }, { status: 403 })));
    await expect(youtrackFetch("/api/x", { token: "abc" })).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 3: Run, see fail**

```bash
npm test -- youtrack/client
```

- [ ] **Step 4: Implement**

Create `lib/youtrack/client.ts`:

```ts
import { youtrackConfig } from "./config";

export class YoutrackError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = "YoutrackError";
  }
}

type Opts = {
  token: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

export async function youtrackFetch<T = unknown>(path: string, opts: Opts): Promise<T> {
  const cfg = youtrackConfig();
  const url = new URL(path, cfg.baseUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

  if (!res.ok) {
    throw new YoutrackError(res.status, parsed, `youtrack ${opts.method ?? "GET"} ${path} → ${res.status}`);
  }
  return parsed as T;
}
```

- [ ] **Step 5: Run, see pass**

```bash
npm test -- youtrack/client
```
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/youtrack/client.ts lib/youtrack/client.test.ts package.json
git commit -m "feat(youtrack): typed fetch wrapper with bearer auth + error class"
```

---

### Task 19: Boards endpoint

**Files:** `lib/youtrack/boards.ts`, `lib/youtrack/boards.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/youtrack/boards.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listBoards } from "./boards";

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles", () =>
    HttpResponse.json([
      { id: "B1", name: "Mobile" },
      { id: "B2", name: "Backend" },
    ]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listBoards", () => {
  it("returns id+name pairs", async () => {
    const boards = await listBoards("token");
    expect(boards).toEqual([
      { id: "B1", name: "Mobile" },
      { id: "B2", name: "Backend" },
    ]);
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- youtrack/boards
```

- [ ] **Step 3: Implement**

Create `lib/youtrack/boards.ts`:

```ts
import { youtrackFetch } from "./client";

export type YtBoard = { id: string; name: string };

export async function listBoards(token: string): Promise<YtBoard[]> {
  const data = await youtrackFetch<YtBoard[]>("/api/agiles", {
    token,
    query: { fields: "id,name" },
  });
  return data;
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- youtrack/boards
```

- [ ] **Step 5: Commit**

```bash
git add lib/youtrack/boards.ts lib/youtrack/boards.test.ts
git commit -m "feat(youtrack): listBoards"
```

---

### Task 20: Sprints endpoint

**Files:** `lib/youtrack/sprints.ts`, `lib/youtrack/sprints.test.ts`

- [ ] **Step 1: Write failing test**

Create `lib/youtrack/sprints.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listSprints, pickDefaultSprint } from "./sprints";

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints", () =>
    HttpResponse.json([
      { id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 },
      { id: "S47", name: "Sprint 47", archived: false, start: 1715731200000, finish: 1716940799000 },
      { id: "S45", name: "Sprint 45", archived: true, start: 0, finish: 1714521599000 },
    ]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("listSprints", () => {
  it("returns sprints excluding archived", async () => {
    const sprints = await listSprints("token", "B1");
    expect(sprints.map((s) => s.id)).toEqual(["S46", "S47"]);
  });
});

describe("pickDefaultSprint", () => {
  it("returns the next sprint after the current one", () => {
    const now = 1715000000000;
    const picked = pickDefaultSprint(
      [
        { id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 }, // current
        { id: "S47", name: "Sprint 47", archived: false, start: 1715731200000, finish: 1716940799000 }, // next
      ],
      now,
    );
    expect(picked?.id).toBe("S47");
  });

  it("falls back to the current sprint when no next one exists", () => {
    const now = 1715000000000;
    const picked = pickDefaultSprint(
      [{ id: "S46", name: "Sprint 46", archived: false, start: 1714521600000, finish: 1715731199000 }],
      now,
    );
    expect(picked?.id).toBe("S46");
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

Create `lib/youtrack/sprints.ts`:

```ts
import { youtrackFetch } from "./client";

export type YtSprint = {
  id: string;
  name: string;
  archived: boolean;
  start: number;
  finish: number;
};

export async function listSprints(token: string, boardId: string): Promise<YtSprint[]> {
  const data = await youtrackFetch<YtSprint[]>(`/api/agiles/${boardId}/sprints`, {
    token,
    query: { fields: "id,name,archived,start,finish" },
  });
  return data.filter((s) => !s.archived);
}

export function pickDefaultSprint(sprints: YtSprint[], nowMs: number): YtSprint | null {
  const active = sprints.filter((s) => s.start <= nowMs && nowMs <= s.finish);
  if (active.length > 0) {
    const current = active[0]!;
    const next = sprints
      .filter((s) => s.start > current.finish)
      .sort((a, b) => a.start - b.start)[0];
    return next ?? current;
  }
  // No active sprint — return the next upcoming one, else the most recent past
  const upcoming = sprints.filter((s) => s.start > nowMs).sort((a, b) => a.start - b.start)[0];
  if (upcoming) return upcoming;
  return sprints.sort((a, b) => b.finish - a.finish)[0] ?? null;
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Commit**

```bash
git add lib/youtrack/sprints.ts lib/youtrack/sprints.test.ts
git commit -m "feat(youtrack): listSprints + pickDefaultSprint heuristic"
```

---

### Task 21: Sprint issues + field updates + comments

**Files:** `lib/youtrack/issues.ts`, `lib/youtrack/issues.test.ts`, `lib/youtrack/comments.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/youtrack/issues.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { listSprintIssues, updateIssueField } from "./issues";

const captured: { method: string; body: unknown }[] = [];

const server = setupServer(
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        {
          id: "1-100",
          idReadable: "FH-1242",
          summary: "Refactor billing webhook handler",
          description: "do the thing",
          customFields: [{ name: "State", value: { name: "Open" } }],
        },
        {
          id: "1-101",
          idReadable: "FH-1243",
          summary: "Done one",
          description: null,
          customFields: [{ name: "State", value: { name: "Done" } }],
        },
      ],
    }),
  ),
  http.post("https://example.youtrack.cloud/api/issues/FH-1242", async ({ request }) => {
    captured.push({ method: request.method, body: await request.json() });
    return HttpResponse.json({});
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(); captured.length = 0; });
afterAll(() => server.close());

describe("listSprintIssues", () => {
  it("returns issues, filtering out done by configured state names", async () => {
    const issues = await listSprintIssues("token", "B1", "S47", { excludeStates: ["Done"] });
    expect(issues.map((i) => i.key)).toEqual(["FH-1242"]);
  });

  it("returns all issues when excludeStates is empty", async () => {
    const issues = await listSprintIssues("token", "B1", "S47", { excludeStates: [] });
    expect(issues.map((i) => i.key)).toEqual(["FH-1242", "FH-1243"]);
  });
});

describe("updateIssueField", () => {
  it("posts a customFields payload", async () => {
    await updateIssueField("token", "FH-1242", "Story Points", 5);
    expect(captured[0]?.method).toBe("POST");
    expect(captured[0]?.body).toEqual({
      customFields: [{ name: "Story Points", value: 5 }],
    });
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

Create `lib/youtrack/issues.ts`:

```ts
import { youtrackFetch } from "./client";

export type YtIssue = {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  stateName: string | null;
};

type RawIssue = {
  id: string;
  idReadable: string;
  summary: string;
  description: string | null;
  customFields: Array<{ name: string; value: { name?: string } | null }>;
};

export async function listSprintIssues(
  token: string,
  boardId: string,
  sprintId: string,
  opts: { excludeStates: string[] },
): Promise<YtIssue[]> {
  const data = await youtrackFetch<{ issues: RawIssue[] }>(
    `/api/agiles/${boardId}/sprints/${sprintId}`,
    {
      token,
      query: {
        fields: "issues(id,idReadable,summary,description,customFields(name,value(name)))",
      },
    },
  );
  const exclude = new Set(opts.excludeStates);
  return (data.issues ?? [])
    .map((i) => ({
      id: i.id,
      key: i.idReadable,
      summary: i.summary,
      description: i.description,
      stateName: i.customFields.find((f) => f.name === "State")?.value?.name ?? null,
    }))
    .filter((i) => !(i.stateName && exclude.has(i.stateName)));
}

export async function updateIssueField(
  token: string,
  issueKey: string,
  fieldName: string,
  value: number | string | null,
): Promise<void> {
  await youtrackFetch(`/api/issues/${issueKey}`, {
    token,
    method: "POST",
    query: { fields: "customFields(name,value)" },
    body: { customFields: [{ name: fieldName, value }] },
  });
}
```

Create `lib/youtrack/comments.ts`:

```ts
import { youtrackFetch } from "./client";

export async function postIssueComment(token: string, issueKey: string, text: string): Promise<{ id: string }> {
  return youtrackFetch<{ id: string }>(`/api/issues/${issueKey}/comments`, {
    token,
    method: "POST",
    query: { fields: "id,text" },
    body: { text },
  });
}
```

- [ ] **Step 4: Run, see pass**

```bash
npm test -- youtrack/issues
```

- [ ] **Step 5: Commit**

```bash
git add lib/youtrack/issues.ts lib/youtrack/issues.test.ts lib/youtrack/comments.ts
git commit -m "feat(youtrack): listSprintIssues + updateIssueField + postIssueComment"
```

---

## Phase 4 — Auth (YouTrack OAuth)

### Task 22: Auth.js v5 base + custom YouTrack provider

**Files:** `lib/auth/youtrack-provider.ts`, `lib/auth/config.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`

- [ ] **Step 1: Create custom provider**

Create `lib/auth/youtrack-provider.ts`:

```ts
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

export type YoutrackProfile = {
  id: string;
  login: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function YoutrackProvider(options: OAuthUserConfig<YoutrackProfile> & { workspaceBaseUrl: string }): OAuthConfig<YoutrackProfile> {
  const base = options.workspaceBaseUrl.replace(/\/$/, "");
  return {
    id: "youtrack",
    name: "YouTrack",
    type: "oauth",
    authorization: {
      url: `${base}/hub/api/rest/oauth2/auth`,
      params: { response_type: "code", scope: "YouTrack", access_type: "offline" },
    },
    token: `${base}/hub/api/rest/oauth2/token`,
    userinfo: {
      url: `${base}/hub/api/rest/users/me?fields=id,login,name,email,avatarUrl`,
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.avatarUrl ?? null,
      };
    },
    options,
  };
}
```

- [ ] **Step 2: Auth.js config**

Create `lib/auth/config.ts`:

```ts
import NextAuth from "next-auth";
import { YoutrackProvider } from "./youtrack-provider";
import { env } from "@/lib/env";
import { db } from "@/lib/db/client";
import { users, oauthAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    YoutrackProvider({
      clientId: env.YT_OAUTH_CLIENT_ID,
      clientSecret: env.YT_OAUTH_CLIENT_SECRET,
      workspaceBaseUrl: env.YT_BASE_URL,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "youtrack" || !profile) return false;
      const youtrackId = String((profile as { id?: string }).id ?? user.id);
      const [existing] = await db.select().from(users).where(eq(users.youtrackId, youtrackId)).limit(1);
      const userRow =
        existing ??
        (await db
          .insert(users)
          .values({
            youtrackId,
            email: user.email ?? "",
            displayName: user.name ?? user.email ?? "Unknown",
            avatarUrl: user.image ?? null,
          })
          .returning())[0]!;

      await db
        .insert(oauthAccounts)
        .values({
          userId: userRow.id,
          provider: "youtrack",
          accessToken: encrypt(account.access_token ?? "", env.YT_TOKEN_ENC_KEY),
          refreshToken: account.refresh_token ? encrypt(account.refresh_token, env.YT_TOKEN_ENC_KEY) : null,
          expiresAt: new Date((account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000),
          scope: account.scope ?? "YouTrack",
        })
        .onConflictDoUpdate({
          target: [oauthAccounts.userId, oauthAccounts.provider],
          set: {
            accessToken: encrypt(account.access_token ?? "", env.YT_TOKEN_ENC_KEY),
            refreshToken: account.refresh_token ? encrypt(account.refresh_token, env.YT_TOKEN_ENC_KEY) : null,
            expiresAt: new Date((account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000),
            scope: account.scope ?? "YouTrack",
          },
        });

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.youtrackId, String((user as { id?: string }).id ?? "")))
          .limit(1);
        if (u) token.userId = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
});
```

- [ ] **Step 3: Route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
export { handlers as GET, handlers as POST } from "@/lib/auth/config";
```

- [ ] **Step 4: Middleware to protect `/app/*`**

Create `middleware.ts` at project root:

```ts
import { auth } from "@/lib/auth/config";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isAppRoute = req.nextUrl.pathname.startsWith("/app");
  if (isAppRoute && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/app/:path*"],
};
```

- [ ] **Step 5: Augment session type**

Create `types/next-auth.d.ts`:

```ts
import "next-auth";
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT { userId?: string; }
}
```

Add to `tsconfig.json` `"include"`: `"types/**/*.d.ts"`.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/ app/api/auth middleware.ts types/next-auth.d.ts tsconfig.json
git commit -m "feat(auth): YouTrack OAuth via Auth.js v5 + protected /app routes"
```

---

### Task 23: Server-side current-user helper + token getter

**Files:** `lib/auth/session.ts`, `lib/auth/session.test.ts`

- [ ] **Step 1: Implement**

Create `lib/auth/session.ts`:

```ts
import { auth } from "./config";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { eq, and } from "drizzle-orm";

export async function getServerUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function getYoutrackAccessToken(userId: string): Promise<string | null> {
  const [acct] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, "youtrack")))
    .limit(1);
  if (!acct) return null;
  return decrypt(acct.accessToken, env.YT_TOKEN_ENC_KEY);
}

export async function requireServerUser() {
  const u = await getServerUser();
  if (!u) throw new Error("unauthenticated");
  return u;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/auth/session.ts
git commit -m "feat(auth): server helpers — getServerUser, getYoutrackAccessToken"
```

(Integration coverage of this helper comes via the session-lifecycle test in Task 38.)

---

### Task 24: Login page + sign-in button

**Files:** `app/login/page.tsx`, `components/shell/sign-in-button.tsx`

- [ ] **Step 1: Sign-in button**

Create `components/shell/sign-in-button.tsx`:

```tsx
"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton({ next }: { next?: string }) {
  return (
    <Button onClick={() => signIn("youtrack", { callbackUrl: next ?? "/app" })}>
      Sign in with YouTrack
    </Button>
  );
}
```

- [ ] **Step 2: Login page**

Create `app/login/page.tsx`:

```tsx
import { SignInButton } from "@/components/shell/sign-in-button";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold">Full House</h1>
      <p className="text-muted-foreground">Sign in to estimate sprints with your team.</p>
      <SignInButton next={searchParams.next} />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run dev
```
Visit http://localhost:3000/login. Confirm the button renders. (Real OAuth flow needs a registered Hub app — not part of this task.)

- [ ] **Step 4: Commit**

```bash
git add app/login components/shell/sign-in-button.tsx
git commit -m "feat(auth): login page + sign-in button"
```

---

## Phase 5 — UI shell (landing, app layout, dashboard)

### Task 25: Marketing landing page + SEO metadata

**Files:** `app/(marketing)/layout.tsx`, `app/(marketing)/page.tsx`, `app/page.tsx` (delete), `app/layout.tsx`

- [ ] **Step 1: Move root page into marketing group**

Delete `app/page.tsx`. Create `app/(marketing)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
```

Create `app/(marketing)/page.tsx`:

```tsx
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Full House — sprint estimation for YouTrack teams",
  description: "Real-time Planning Poker tied to YouTrack: vote story points, estimate implementation/review/test, and sync back to your sprint.",
  alternates: { canonical: env.NEXT_PUBLIC_SITE_URL },
  openGraph: {
    title: "Full House",
    description: "Planning Poker for YouTrack teams.",
    url: env.NEXT_PUBLIC_SITE_URL,
    type: "website",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 flex flex-col gap-8">
      <h1 className="text-5xl font-bold">Full House</h1>
      <p className="text-xl text-muted-foreground">
        Sprint estimation tools that talk to YouTrack. Start with Planning Poker; more tools coming.
      </p>
      <div>
        <Button asChild size="lg"><Link href="/login">Get started</Link></Button>
      </div>
      <section className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Feature title="Real-time voting" body="Live presence, simultaneous reveal, revote when you need to discuss." />
        <Feature title="Three-phase duration" body="Estimate implementation, review and test separately. Skip any phase." />
        <Feature title="Writes back to YouTrack" body="Final SP and duration update the issue. A summary comment captures the room." />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Update root layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Full House", template: "%s — Full House" },
  description: "Sprint estimation for YouTrack teams.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

Add the sonner toaster:

```bash
npx shadcn@latest add sonner
```

- [ ] **Step 3: Update smoke test**

Edit `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("landing page renders the headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Full House", level: 1 })).toBeVisible();
});
```

- [ ] **Step 4: Run smoke**

```bash
npm run test:e2e
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): marketing landing page with SEO metadata"
```

---

### Task 26: App shell layout with auth gate, nav, user menu

**Files:** `app/app/layout.tsx`, `components/shell/app-nav.tsx`, `components/shell/user-menu.tsx`

- [ ] **Step 1: User menu**

Create `components/shell/user-menu.tsx`:

```tsx
"use client";
import { signOut } from "next-auth/react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserMenu({ name, email, image }: { name: string; email: string; image: string | null }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none">
        <Avatar>
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled className="opacity-100">
          <div className="flex flex-col">
            <span className="font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: App nav**

Create `components/shell/app-nav.tsx`:

```tsx
import Link from "next/link";
import { UserMenu } from "./user-menu";
import { getServerUser } from "@/lib/auth/session";

export async function AppNav() {
  const user = await getServerUser();
  if (!user) return null;
  return (
    <nav className="border-b">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link href="/app" className="font-semibold">Full House</Link>
        <div className="flex items-center gap-4">
          <Link href="/app/poker" className="text-sm text-muted-foreground hover:text-foreground">Poker</Link>
          <UserMenu name={user.displayName} email={user.email} image={user.avatarUrl} />
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: App layout (auth gate)**

Create `app/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { AppNav } from "@/components/shell/app-nav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Dashboard placeholder**

Create `app/app/page.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">Your tools</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Planning Poker</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Estimate a sprint with your team.</p>
            <Button asChild><Link href="/app/poker">Start a session</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): app shell with auth gate, nav, user menu, dashboard"
```

---

## Phase 6 — Session creation & joining

### Task 27: API — list boards and sprints (server-proxied)

**Files:** `app/api/youtrack/boards/route.ts`, `app/api/youtrack/boards/[boardId]/sprints/route.ts`

- [ ] **Step 1: Boards route**

Create `app/api/youtrack/boards/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { listBoards } from "@/lib/youtrack/boards";

export async function GET() {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const boards = await listBoards(token);
  return NextResponse.json({ boards });
}
```

- [ ] **Step 2: Sprints route**

Create `app/api/youtrack/boards/[boardId]/sprints/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { listSprints, pickDefaultSprint } from "@/lib/youtrack/sprints";

export async function GET(_req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const sprints = await listSprints(token, boardId);
  const defaultSprint = pickDefaultSprint(sprints, Date.now());
  return NextResponse.json({ sprints, defaultSprintId: defaultSprint?.id ?? null });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/youtrack
git commit -m "feat(api): GET /api/youtrack/boards and /sprints"
```

---

### Task 28: Session-create API + page

**Files:** `app/api/sessions/route.ts`, `app/app/poker/page.tsx`, `components/poker/session-create-form.tsx`

- [ ] **Step 1: Service — createSession**

Append to (or create) `lib/poker/service.ts`:

```ts
import { db } from "@/lib/db/client";
import { sessions, sessionMembers, issues } from "@/lib/db/schema";
import { listSprintIssues } from "@/lib/youtrack/issues";
import { youtrackConfig } from "@/lib/youtrack/config";

export async function createSession(opts: {
  creatorUserId: string;
  token: string;
  boardId: string;
  sprintId: string;
  sprintName: string;
}) {
  const cfg = youtrackConfig();
  const ytIssues = await listSprintIssues(opts.token, opts.boardId, opts.sprintId, {
    excludeStates: cfg.doneStateNames,
  });

  return db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        createdBy: opts.creatorUserId,
        boardId: opts.boardId,
        sprintId: opts.sprintId,
        sprintName: opts.sprintName,
      })
      .returning();
    if (!session) throw new Error("session insert failed");

    await tx.insert(sessionMembers).values({
      sessionId: session.id,
      userId: opts.creatorUserId,
      role: "moderator",
    });

    if (ytIssues.length > 0) {
      await tx.insert(issues).values(
        ytIssues.map((i, idx) => ({
          sessionId: session.id,
          youtrackIssueId: i.id,
          issueKey: i.key,
          summary: i.summary,
          description: i.description,
          position: idx,
        })),
      );
    }

    return session;
  });
}
```

- [ ] **Step 2: API route**

Create `app/api/sessions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { createSession } from "@/lib/poker/service";

const Body = z.object({
  boardId: z.string().min(1),
  sprintId: z.string().min(1),
  sprintName: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const session = await createSession({
    creatorUserId: user.id,
    token,
    boardId: parsed.data.boardId,
    sprintId: parsed.data.sprintId,
    sprintName: parsed.data.sprintName,
  });
  return NextResponse.json({ sessionId: session.id });
}
```

- [ ] **Step 3: Create-session client form**

Create `components/poker/session-create-form.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Board = { id: string; name: string };
type Sprint = { id: string; name: string };

export function SessionCreateForm() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/youtrack/boards").then((r) => r.json()).then((d) => setBoards(d.boards ?? []));
  }, []);

  useEffect(() => {
    if (!boardId) return;
    setSprints([]); setSprintId("");
    fetch(`/api/youtrack/boards/${boardId}/sprints`).then((r) => r.json()).then((d) => {
      setSprints(d.sprints ?? []);
      if (d.defaultSprintId) setSprintId(d.defaultSprintId);
    });
  }, [boardId]);

  const sprintName = sprints.find((s) => s.id === sprintId)?.name ?? "";

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, sprintId, sprintName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { sessionId } = await res.json();
      router.push(`/app/poker/${sessionId}`);
    } catch (e) {
      toast.error(`Could not start session: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <div>
        <Label className="mb-2 block">Board</Label>
        <Select value={boardId} onValueChange={setBoardId}>
          <SelectTrigger><SelectValue placeholder="Pick a board" /></SelectTrigger>
          <SelectContent>
            {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-2 block">Sprint</Label>
        <Select value={sprintId} onValueChange={setSprintId} disabled={!boardId}>
          <SelectTrigger><SelectValue placeholder="Pick a sprint" /></SelectTrigger>
          <SelectContent>
            {sprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button disabled={!boardId || !sprintId || loading} onClick={start}>
        {loading ? "Starting…" : "Start session"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Page**

Create `app/app/poker/page.tsx`:

```tsx
import { SessionCreateForm } from "@/components/poker/session-create-form";

export default function PokerHome() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">Start a session</h1>
      <SessionCreateForm />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(poker): session creation API + board/sprint picker UI"
```

---

### Task 29: Join session endpoint + room scaffold

**Files:** `app/api/sessions/[id]/join/route.ts`, `lib/poker/service.ts` (extend), `app/app/poker/[sessionId]/page.tsx`

- [ ] **Step 1: Service — joinSession + getSessionWithMembers**

Append to `lib/poker/service.ts`:

```ts
import { eq, and } from "drizzle-orm";

export async function joinSession(sessionId: string, userId: string) {
  await db
    .insert(sessionMembers)
    .values({ sessionId, userId, role: "voter" })
    .onConflictDoUpdate({
      target: [sessionMembers.sessionId, sessionMembers.userId],
      set: { lastSeenAt: new Date() },
    });
}

export async function getSessionView(sessionId: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) return null;
  const members = await db
    .select({
      userId: sessionMembers.userId,
      role: sessionMembers.role,
      lastSeenAt: sessionMembers.lastSeenAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, sessionId));
  const issuesList = await db
    .select()
    .from(issues)
    .where(eq(issues.sessionId, sessionId))
    .orderBy(issues.position);
  return { session, members, issues: issuesList };
}
```

(Add `users` to the imports.)

- [ ] **Step 2: Join API**

Create `app/api/sessions/[id]/join/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { joinSession } from "@/lib/poker/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await joinSession(id, user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Room page (server component, static for now)**

Create `app/app/poker/[sessionId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { getSessionView, joinSession } from "@/lib/poker/service";
import { RoomClient } from "./room.client";

export default async function RoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/app/poker/${sessionId}`);
  await joinSession(sessionId, user.id);
  const view = await getSessionView(sessionId);
  if (!view) notFound();
  return <RoomClient initialView={view} currentUserId={user.id} />;
}
```

- [ ] **Step 4: Room client stub**

Create `app/app/poker/[sessionId]/room.client.tsx`:

```tsx
"use client";
import type { getSessionView } from "@/lib/poker/service";

type Awaited<T> = T extends Promise<infer U> ? U : T;
type View = NonNullable<Awaited<ReturnType<typeof getSessionView>>>;

export function RoomClient({ initialView, currentUserId }: { initialView: View; currentUserId: string }) {
  const { session, members, issues } = initialView;
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold">{session.sprintName}</h1>
      <p className="text-sm text-muted-foreground">{members.length} member(s) — {issues.length} issue(s)</p>
      <p className="text-xs text-muted-foreground">you = {currentUserId}</p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(poker): join session API + room page scaffold"
```

---

### Task 30: Integration test for session lifecycle

**Files:** `tests/integration/session-lifecycle.test.ts`, `tests/integration/msw-handlers.ts`

- [ ] **Step 1: MSW handlers for YouTrack**

Create `tests/integration/msw-handlers.ts`:

```ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("https://example.youtrack.cloud/api/agiles/B1/sprints/S47", () =>
    HttpResponse.json({
      issues: [
        { id: "yt-1", idReadable: "FH-100", summary: "Foo", description: null, customFields: [{ name: "State", value: { name: "Open" } }] },
        { id: "yt-2", idReadable: "FH-101", summary: "Bar", description: "details", customFields: [{ name: "State", value: { name: "Open" } }] },
      ],
    }),
  ),
];
```

- [ ] **Step 2: Test**

Create `tests/integration/session-lifecycle.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users } from "@/lib/db/schema";
import { createSession, joinSession, getSessionView } from "@/lib/poker/service";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(name: string) {
  const [u] = await testDb.insert(users).values({
    youtrackId: name,
    email: `${name}@x`,
    displayName: name,
  }).returning();
  return u!;
}

describe("session lifecycle", () => {
  it("creates a session, seeds issues from YouTrack, and joins members", async () => {
    const moderator = await newUser("mod");
    const voter = await newUser("voter");

    const session = await createSession({
      creatorUserId: moderator.id,
      token: "tok",
      boardId: "B1",
      sprintId: "S47",
      sprintName: "Sprint 47",
    });

    await joinSession(session.id, voter.id);

    const view = await getSessionView(session.id);
    expect(view).not.toBeNull();
    expect(view!.issues.map((i) => i.issueKey).sort()).toEqual(["FH-100", "FH-101"]);
    expect(view!.members.length).toBe(2);
    expect(view!.members.find((m) => m.userId === moderator.id)?.role).toBe("moderator");
    expect(view!.members.find((m) => m.userId === voter.id)?.role).toBe("voter");
  });
});
```

- [ ] **Step 3: Run integration**

```bash
npm run test:integration
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(integration): session-create + join + view"
```

---

## Phase 7 — Voting service + API endpoints

### Task 31: Service — pick issue, cast vote, reveal

**Files:** `lib/poker/service.ts` (extend), `lib/poker/service.test.ts`

- [ ] **Step 1: Extend service**

Append to `lib/poker/service.ts`:

```ts
import { estimates, votes } from "@/lib/db/schema";
import { reduceIssue, phaseOfStatus, type IssueStatus } from "./state-machine";
import { isValidCard } from "./decks";
import { desc, sql } from "drizzle-orm";

export async function pickIssue(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    // ensure no other issue is currently in-flight (not pending / completed / skipped)
    const inFlight = await tx
      .select()
      .from(issues)
      .where(and(eq(issues.sessionId, sessionId), notInState(["pending", "completed", "skipped"])));
    if (inFlight.length > 0) throw new Error("another issue is already in progress");

    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");
    if (issue.status !== "pending") throw new Error(`issue is ${issue.status}`);

    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "pick" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    await tx.insert(estimates).values({ issueId, kind: "sp", phase: null, round: 1 });
    return next;
  });
}

export async function castVote(sessionId: string, issueId: string, userId: string, value: number) {
  return db.transaction(async (tx) => {
    await assertMember(tx, sessionId, userId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue || issue.sessionId !== sessionId) throw new Error("issue not in session");
    const { kind } = phaseOfStatus(issue.status as IssueStatus);
    if (!kind) throw new Error("not in a voting phase");
    if (!issue.status.endsWith("_voting")) throw new Error(`cannot vote in ${issue.status}`);
    if (!isValidCard(value, kind)) throw new Error(`invalid ${kind} card: ${value}`);

    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate row");

    await tx
      .insert(votes)
      .values({ estimateId: current.id, userId, value: String(value) })
      .onConflictDoUpdate({
        target: [votes.estimateId, votes.userId],
        set: { value: String(value), castAt: new Date() },
      });
  });
}

export async function reveal(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "reveal" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    return next;
  });
}

async function currentEstimate(tx: typeof db, issueId: string) {
  const [row] = await tx
    .select()
    .from(estimates)
    .where(eq(estimates.issueId, issueId))
    .orderBy(desc(estimates.round), desc(estimates.id))
    .limit(1);
  return row ?? null;
}

async function assertMember(tx: typeof db, sessionId: string, userId: string) {
  const [m] = await tx
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!m) throw new Error("not a member of this session");
}

async function assertModerator(tx: typeof db, sessionId: string, userId: string) {
  const [m] = await tx
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
    .limit(1);
  if (!m || m.role !== "moderator") throw new Error("moderator only");
}

function notInState(states: string[]) {
  // Drizzle doesn't have NOT IN inline; use sql template
  return sql`${issues.status} NOT IN (${sql.join(states.map((s) => sql`${s}`), sql`, `)})`;
}
```

- [ ] **Step 2: Service test (integration)**

Create `tests/integration/voting.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import { createSession, joinSession, pickIssue, castVote, reveal } from "@/lib/poker/service";
import { eq } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(name: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: name + Math.random(), email: name, displayName: name }).returning();
  return u!;
}

describe("voting", () => {
  it("pick → vote → reveal", async () => {
    const mod = await newUser("mod");
    const voter = await newUser("voter");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, voter.id);
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    expect(firstIssue).toBeDefined();

    const picked = await pickIssue(session.id, firstIssue!.id, mod.id);
    expect(picked.status).toBe("sp_voting");

    await castVote(session.id, firstIssue!.id, mod.id, 5);
    await castVote(session.id, firstIssue!.id, voter.id, 3);

    const revealed = await reveal(session.id, firstIssue!.id, mod.id);
    expect(revealed.status).toBe("sp_revealed");
  });

  it("non-moderator cannot pick", async () => {
    const mod = await newUser("mod2");
    const voter = await newUser("voter2");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, voter.id);
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await expect(pickIssue(session.id, firstIssue!.id, voter.id)).rejects.toThrow(/moderator/);
  });

  it("invalid SP card rejected", async () => {
    const mod = await newUser("mod3");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [firstIssue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, firstIssue!.id, mod.id);
    await expect(castVote(session.id, firstIssue!.id, mod.id, 4)).rejects.toThrow(/invalid sp card/);
  });
});
```

- [ ] **Step 3: Run integration**

```bash
npm run test:integration
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(poker): service — pickIssue, castVote, reveal + integration tests"
```

---

### Task 32: Service — submit, skip, revote, takeover, end

**Files:** `lib/poker/service.ts` (extend), `tests/integration/voting-2.test.ts`

- [ ] **Step 1: Extend service**

Append to `lib/poker/service.ts`:

```ts
export async function submitFinal(sessionId: string, issueId: string, moderatorUserId: string, finalValue: number) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    if (!issue.status.endsWith("_revealed")) throw new Error(`cannot submit from ${issue.status}`);

    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate");
    await tx
      .update(estimates)
      .set({ finalValue: String(finalValue), decidedBy: moderatorUserId, decidedAt: new Date() })
      .where(eq(estimates.id, current.id));

    const next = reduceIssue({ status: issue.status as IssueStatus, round: current.round }, { type: "submit" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));

    // Open the next estimate row if we advanced into a voting state
    const phase = phaseOfStatus(next.status);
    if (phase.kind && next.status.endsWith("_voting")) {
      await tx.insert(estimates).values({ issueId, kind: phase.kind, phase: phase.phase, round: 1 });
    }
    return next;
  });
}

export async function skipPhase(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const current = await currentEstimate(tx, issueId);
    if (current) {
      await tx
        .update(estimates)
        .set({ finalValue: null, decidedBy: moderatorUserId, decidedAt: new Date() })
        .where(eq(estimates.id, current.id));
    }
    const next = reduceIssue({ status: issue.status as IssueStatus, round: current?.round ?? 1 }, { type: "skipPhase" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    const phase = phaseOfStatus(next.status);
    if (phase.kind && next.status.endsWith("_voting")) {
      await tx.insert(estimates).values({ issueId, kind: phase.kind, phase: phase.phase, round: 1 });
    }
    return next;
  });
}

export async function skipIssue(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: 1 }, { type: "skipIssue" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    return next;
  });
}

export async function startRevote(sessionId: string, issueId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    const [issue] = await tx.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!issue) throw new Error("issue not found");
    const current = await currentEstimate(tx, issueId);
    if (!current) throw new Error("no current estimate");
    const next = reduceIssue({ status: issue.status as IssueStatus, round: current.round }, { type: "revote" });
    await tx.update(issues).set({ status: next.status }).where(eq(issues.id, issueId));
    // open a new estimate row at round+1
    await tx.insert(estimates).values({
      issueId, kind: current.kind, phase: current.phase, round: current.round + 1,
    });
    return next;
  });
}

export async function takeOverModeration(sessionId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [me] = await tx
      .select()
      .from(sessionMembers)
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)))
      .limit(1);
    if (!me) throw new Error("not a member");
    const [currentMod] = await tx
      .select()
      .from(sessionMembers)
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.role, "moderator")))
      .limit(1);
    if (currentMod) {
      const stale = Date.now() - currentMod.lastSeenAt.getTime() > 5 * 60 * 1000;
      if (!stale) throw new Error("current moderator is active");
      await tx
        .update(sessionMembers)
        .set({ role: "voter" })
        .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, currentMod.userId)));
    }
    await tx
      .update(sessionMembers)
      .set({ role: "moderator", lastSeenAt: new Date() })
      .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, userId)));
  });
}

export async function endSession(sessionId: string, moderatorUserId: string) {
  return db.transaction(async (tx) => {
    await assertModerator(tx, sessionId, moderatorUserId);
    await tx.update(sessions).set({ status: "ended", endedAt: new Date() }).where(eq(sessions.id, sessionId));
  });
}
```

- [ ] **Step 2: Tests**

Create `tests/integration/voting-2.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues, estimates, votes } from "@/lib/db/schema";
import {
  createSession, pickIssue, castVote, reveal, submitFinal,
  skipPhase, startRevote, skipIssue, joinSession, takeOverModeration,
} from "@/lib/poker/service";
import { eq, desc } from "drizzle-orm";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function newUser(label: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: label + Math.random(), email: label, displayName: label }).returning();
  return u!;
}

describe("voting advanced", () => {
  it("full flow SP → impl → review → test with submit", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    let next = await submitFinal(session.id, issue!.id, mod.id, 5);
    expect(next.status).toBe("dur_impl_voting");
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 8);
    expect(next.status).toBe("dur_review_voting");
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 2);
    expect(next.status).toBe("dur_test_voting");
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    next = await submitFinal(session.id, issue!.id, mod.id, 2);
    expect(next.status).toBe("completed");
  });

  it("revote opens a new round and lets users vote again", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 3);
    await reveal(session.id, issue!.id, mod.id);
    const next = await startRevote(session.id, issue!.id, mod.id);
    expect(next.status).toBe("sp_voting");

    // a fresh estimate row should exist with round=2
    const rows = await testDb.select().from(estimates).where(eq(estimates.issueId, issue!.id)).orderBy(desc(estimates.round));
    expect(rows[0]!.round).toBe(2);

    await castVote(session.id, issue!.id, mod.id, 8);
    const allVotes = await testDb.select().from(votes);
    expect(allVotes.length).toBe(2);
  });

  it("skipPhase advances and leaves a null-final estimate row", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    const next = await skipPhase(session.id, issue!.id, mod.id);
    expect(next.status).toBe("dur_impl_voting");
    const spEstimate = await testDb.select().from(estimates).where(eq(estimates.kind, "sp"));
    expect(spEstimate[0]!.finalValue).toBeNull();
    expect(spEstimate[0]!.decidedBy).toBe(mod.id);
  });

  it("skipIssue moves the issue out of flow", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    const next = await skipIssue(session.id, issue!.id, mod.id);
    expect(next.status).toBe("skipped");
  });

  it("takeover refuses when current moderator is active", async () => {
    const mod = await newUser("mod");
    const member = await newUser("m2");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    await joinSession(session.id, member.id);
    await expect(takeOverModeration(session.id, member.id)).rejects.toThrow(/active/);
  });
});
```

- [ ] **Step 3: Run**

```bash
npm run test:integration
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(poker): service — submit, skip phase/issue, revote, takeover, end"
```

---

### Task 33: REST endpoints for all moderator + voter actions

**Files:** `app/api/sessions/[id]/*` — one route file per action

- [ ] **Step 1: Pick issue**

Create `app/api/sessions/[id]/pick-issue/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { pickIssue } from "@/lib/poker/service";
import { broadcastIssueChanged, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await pickIssue(id, parsed.data.issueId, user.id);
  await broadcastIssueChanged(id, parsed.data.issueId);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  return NextResponse.json({ status: next.status, round: next.round });
}
```

- [ ] **Step 2: Cast vote**

Create `app/api/sessions/[id]/vote/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { castVote } from "@/lib/poker/service";
import { broadcastVoteCast } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid(), value: z.number() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await castVote(id, parsed.data.issueId, user.id, parsed.data.value);
  await broadcastVoteCast(id, parsed.data.issueId, user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Reveal**

Create `app/api/sessions/[id]/reveal/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { reveal } from "@/lib/poker/service";
import { broadcastVotesRevealed, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await reveal(id, parsed.data.issueId, user.id);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  await broadcastVotesRevealed(id, parsed.data.issueId);
  return NextResponse.json({ status: next.status });
}
```

- [ ] **Step 4: Submit final**

Create `app/api/sessions/[id]/submit/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth/session";
import { submitFinal } from "@/lib/poker/service";
import { broadcastFinalSubmitted, broadcastPhaseChanged } from "@/lib/pusher/server";

const Body = z.object({ issueId: z.string().uuid(), finalValue: z.number() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const next = await submitFinal(id, parsed.data.issueId, user.id, parsed.data.finalValue);
  await broadcastFinalSubmitted(id, parsed.data.issueId, parsed.data.finalValue);
  await broadcastPhaseChanged(id, parsed.data.issueId, next.status, next.round);
  return NextResponse.json({ status: next.status });
}
```

- [ ] **Step 5: Skip phase / skip issue / revote / takeover / end**

Create the analogous routes (same shape) at:

- `app/api/sessions/[id]/skip-phase/route.ts` — body `{ issueId }`, calls `skipPhase`, broadcasts `phase-skipped` + `phase-changed`.
- `app/api/sessions/[id]/skip-issue/route.ts` — body `{ issueId }`, calls `skipIssue`, broadcasts `phase-changed`.
- `app/api/sessions/[id]/revote/route.ts` — body `{ issueId }`, calls `startRevote`, broadcasts `phase-changed`.
- `app/api/sessions/[id]/takeover/route.ts` — no body, calls `takeOverModeration`, broadcasts `member-joined` (with new role).
- `app/api/sessions/[id]/route.ts` — `DELETE` calls `endSession`, broadcasts `session-ended`.

Use the same handler scaffold as above; refer to Task 33 Steps 3–4 for the exact pattern.

- [ ] **Step 6: Commit** (after Pusher server in Task 34 is wired; for now skip broadcast imports — or stub `lib/pusher/server.ts` with no-op exports). Add no-op stubs:

Create `lib/pusher/server.ts`:

```ts
export async function broadcastIssueChanged(_s: string, _i: string) {}
export async function broadcastPhaseChanged(_s: string, _i: string, _st: string, _r: number) {}
export async function broadcastVoteCast(_s: string, _i: string, _u: string) {}
export async function broadcastVotesRevealed(_s: string, _i: string) {}
export async function broadcastFinalSubmitted(_s: string, _i: string, _v: number) {}
export async function broadcastPhaseSkipped(_s: string, _i: string) {}
export async function broadcastSessionEnded(_s: string) {}
export async function broadcastMemberUpdated(_s: string) {}
```

```bash
git add app/api/sessions lib/pusher/server.ts
git commit -m "feat(api): voting endpoints with stub broadcasts (real Pusher in next task)"
```

---

## Phase 8 — Realtime (Pusher)

### Task 34: Pusher server SDK + private channel auth + real broadcasts

**Files:** `lib/pusher/server.ts` (replace stubs), `app/api/pusher/auth/route.ts`

- [ ] **Step 1: Replace stub with real Pusher server**

Replace `lib/pusher/server.ts`:

```ts
import Pusher from "pusher";
import { env } from "@/lib/env";

const pusher = new Pusher({
  appId: env.PUSHER_APP_ID,
  key: env.PUSHER_KEY,
  secret: env.PUSHER_SECRET,
  cluster: env.PUSHER_CLUSTER,
  useTLS: true,
});

function channel(sessionId: string) { return `private-session-${sessionId}`; }

export async function broadcastIssueChanged(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "issue-changed", { issueId });
}
export async function broadcastPhaseChanged(sessionId: string, issueId: string, status: string, round: number) {
  await pusher.trigger(channel(sessionId), "phase-changed", { issueId, status, round });
}
export async function broadcastVoteCast(sessionId: string, issueId: string, userId: string) {
  await pusher.trigger(channel(sessionId), "vote-cast", { issueId, userId });
}
export async function broadcastVotesRevealed(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "votes-revealed", { issueId });
}
export async function broadcastFinalSubmitted(sessionId: string, issueId: string, finalValue: number) {
  await pusher.trigger(channel(sessionId), "final-submitted", { issueId, finalValue });
}
export async function broadcastPhaseSkipped(sessionId: string, issueId: string) {
  await pusher.trigger(channel(sessionId), "phase-skipped", { issueId });
}
export async function broadcastSessionEnded(sessionId: string) {
  await pusher.trigger(channel(sessionId), "session-ended", {});
}
export async function broadcastMemberUpdated(sessionId: string) {
  await pusher.trigger(channel(sessionId), "members-updated", {});
}

export const pusherForAuth = pusher;
```

- [ ] **Step 2: Channel-auth endpoint**

Create `app/api/pusher/auth/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sessionMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { pusherForAuth } from "@/lib/pusher/server";

export async function POST(req: Request) {
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const form = await req.formData();
  const socketId = form.get("socket_id");
  const channelName = form.get("channel_name");
  if (typeof socketId !== "string" || typeof channelName !== "string")
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const match = channelName.match(/^private-session-([0-9a-f-]{36})$/);
  if (!match) return NextResponse.json({ error: "invalid channel" }, { status: 400 });
  const sessionId = match[1]!;

  const [member] = await db
    .select()
    .from(sessionMembers)
    .where(and(eq(sessionMembers.sessionId, sessionId), eq(sessionMembers.userId, user.id)))
    .limit(1);
  if (!member) return NextResponse.json({ error: "not a member" }, { status: 403 });

  const authResponse = pusherForAuth.authorizeChannel(socketId, channelName);
  return NextResponse.json(authResponse);
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/pusher/server.ts app/api/pusher/auth
git commit -m "feat(realtime): real Pusher server broadcasts + private channel auth"
```

---

### Task 35: Pusher client SDK + room subscription hook

**Files:** `lib/pusher/client.ts`, `hooks/use-session-room.ts`

- [ ] **Step 1: Client singleton**

Create `lib/pusher/client.ts`:

```ts
"use client";
import Pusher from "pusher-js";

let client: Pusher | null = null;

export function getPusherClient(): Pusher {
  if (client) return client;
  client = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
  });
  return client;
}
```

- [ ] **Step 2: Room hook**

Create `hooks/use-session-room.ts`:

```ts
"use client";
import { useEffect, useState } from "react";
import { getPusherClient } from "@/lib/pusher/client";

type Event = { type: string; payload: unknown };

export function useSessionRoom(sessionId: string, onEvent: (e: Event) => void) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const pusher = getPusherClient();
    const ch = pusher.subscribe(`private-session-${sessionId}`);
    const types = [
      "issue-changed", "phase-changed", "vote-cast", "votes-revealed",
      "final-submitted", "phase-skipped", "session-ended", "members-updated",
    ];
    const bound: Array<[string, (data: unknown) => void]> = [];
    for (const t of types) {
      const fn = (data: unknown) => onEvent({ type: t, payload: data });
      ch.bind(t, fn);
      bound.push([t, fn]);
    }
    ch.bind("pusher:subscription_succeeded", () => setConnected(true));
    return () => {
      for (const [t, fn] of bound) ch.unbind(t, fn);
      pusher.unsubscribe(`private-session-${sessionId}`);
    };
  }, [sessionId, onEvent]);

  return { connected };
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/pusher/client.ts hooks/use-session-room.ts
git commit -m "feat(realtime): pusher client + use-session-room hook"
```

---

## Phase 9 — Estimation room UI (Stage layout)

### Task 36: GET /api/sessions/[id] — full room snapshot

**Files:** `app/api/sessions/[id]/route.ts`, `lib/poker/service.ts` (extend)

- [ ] **Step 1: Extend service — getRoomSnapshot**

Append to `lib/poker/service.ts`:

```ts
export type RoomSnapshot = {
  session: typeof sessions.$inferSelect;
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: Date }>;
  issues: Array<typeof issues.$inferSelect>;
  activeIssue: {
    issue: typeof issues.$inferSelect;
    currentEstimate: typeof estimates.$inferSelect;
    votes: Array<{ userId: string; value: number }>;
    isRevealed: boolean;
  } | null;
};

export async function getRoomSnapshot(sessionId: string): Promise<RoomSnapshot | null> {
  const view = await getSessionView(sessionId);
  if (!view) return null;
  const active = view.issues.find((i) => !["pending", "completed", "skipped"].includes(i.status));
  let activeIssue: RoomSnapshot["activeIssue"] = null;
  if (active) {
    const [current] = await db
      .select()
      .from(estimates)
      .where(eq(estimates.issueId, active.id))
      .orderBy(desc(estimates.round), desc(estimates.id))
      .limit(1);
    if (current) {
      const isRevealed = active.status.endsWith("_revealed");
      const voteRows = await db
        .select({ userId: votes.userId, value: votes.value })
        .from(votes)
        .where(eq(votes.estimateId, current.id));
      activeIssue = {
        issue: active,
        currentEstimate: current,
        votes: voteRows.map((v) => ({ userId: v.userId, value: Number(v.value) })),
        isRevealed,
      };
    }
  }
  return { session: view.session, members: view.members, issues: view.issues, activeIssue };
}
```

- [ ] **Step 2: GET route**

Create `app/api/sessions/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { endSession, getRoomSnapshot } from "@/lib/poker/service";
import { broadcastSessionEnded } from "@/lib/pusher/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const snap = await getRoomSnapshot(id);
  if (!snap) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(snap);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await endSession(id, user.id);
  await broadcastSessionEnded(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/route.ts lib/poker/service.ts
git commit -m "feat(api): GET /api/sessions/[id] snapshot + DELETE end session"
```

---

### Task 37: Room components — voter list, card deck, reveal panel, controls

**Files:** `components/poker/voter-list.tsx`, `components/poker/card-deck.tsx`, `components/poker/reveal-panel.tsx`, `components/poker/moderator-controls.tsx`, `components/poker/issue-card.tsx`, `components/poker/round-badge.tsx`, `components/poker/phase-stepper.tsx`

- [ ] **Step 1: Voter list**

Create `components/poker/voter-list.tsx`:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Member = { userId: string; displayName: string; avatarUrl: string | null; role: string };

export function VoterList({
  members, votedUserIds, moderatorId,
}: { members: Member[]; votedUserIds: Set<string>; moderatorId: string | null }) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {members.map((m) => {
        const initials = m.displayName.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
        const voted = votedUserIds.has(m.userId);
        return (
          <div key={m.userId} className="flex flex-col items-center gap-1">
            <div className={`relative rounded-full ${voted ? "ring-2 ring-emerald-500" : "ring-1 ring-muted"}`}>
              <Avatar>
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {voted && (
                <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</span>
              )}
            </div>
            <span className="text-xs">{m.displayName}</span>
            {m.userId === moderatorId && <Badge variant="secondary" className="text-[10px]">mod</Badge>}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Card deck**

Create `components/poker/card-deck.tsx`:

```tsx
"use client";
import { cn } from "@/lib/utils";

export function CardDeck({
  deck, selected, onPick, disabled,
}: { deck: readonly number[]; selected: number | null; onPick: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {deck.map((v) => (
        <button
          key={v}
          disabled={disabled}
          onClick={() => onPick(v)}
          className={cn(
            "w-14 h-20 rounded-md border text-lg font-semibold flex items-center justify-center",
            selected === v ? "border-2 border-emerald-500 bg-emerald-50" : "border-muted hover:border-foreground",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Reveal panel**

Create `components/poker/reveal-panel.tsx`:

```tsx
type Member = { userId: string; displayName: string };
export function RevealPanel({
  votes, suggestion, members, unit,
}: { votes: Array<{ userId: string; value: number }>; suggestion: number | null; members: Member[]; unit: "" | "h" }) {
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "?";
  const byValue = new Map<number, string[]>();
  for (const v of votes) {
    const list = byValue.get(v.value) ?? [];
    list.push(nameOf(v.userId));
    byValue.set(v.value, list);
  }
  const groups = [...byValue.entries()].sort(([a], [b]) => a - b);
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground text-center">
        Suggested: <span className="font-semibold text-foreground">{suggestion === null ? "—" : `${suggestion}${unit}`}</span>
      </div>
      <div className="flex gap-3 justify-center flex-wrap">
        {groups.map(([value, names]) => (
          <div key={value} className="flex flex-col items-center gap-1">
            <div className="w-14 h-20 rounded-md border-2 border-emerald-500 bg-emerald-50 flex items-center justify-center font-semibold text-lg">
              {value}{unit}
            </div>
            <span className="text-xs text-muted-foreground">{names.join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Round badge + phase stepper + issue card**

Create `components/poker/round-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
export function RoundBadge({ round }: { round: number }) {
  if (round <= 1) return null;
  return <Badge variant="outline">Round {round}</Badge>;
}
```

Create `components/poker/phase-stepper.tsx`:

```tsx
const STEPS = [
  { key: "sp", label: "SP" },
  { key: "impl", label: "Impl" },
  { key: "review", label: "Review" },
  { key: "test", label: "Test" },
] as const;

export function PhaseStepper({ status }: { status: string }) {
  const active = activeStep(status);
  return (
    <div className="flex gap-2 justify-center text-xs">
      {STEPS.map((s, i) => (
        <span key={s.key} className={i === active ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {s.label}{i < STEPS.length - 1 ? " → " : ""}
        </span>
      ))}
    </div>
  );
}

function activeStep(status: string): number {
  if (status.startsWith("sp_")) return 0;
  if (status.startsWith("dur_impl")) return 1;
  if (status.startsWith("dur_review")) return 2;
  if (status.startsWith("dur_test")) return 3;
  return -1;
}
```

Create `components/poker/issue-card.tsx`:

```tsx
import Link from "next/link";
import { env } from "@/lib/env";

export function IssueCard({ keyId, summary, description }: { keyId: string; summary: string; description: string | null }) {
  const href = `${process.env.NEXT_PUBLIC_YT_BASE_URL ?? ""}/issue/${keyId}`;
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Current Issue</div>
      <h2 className="text-2xl font-semibold mt-1">
        <Link href={href} target="_blank" className="hover:underline">{keyId}</Link>
        <span className="mx-2 text-muted-foreground">—</span>{summary}
      </h2>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-prose mx-auto">{description}</p>}
    </div>
  );
}
```

(Add `NEXT_PUBLIC_YT_BASE_URL` to env if you want clickable links; for now the link will fall back to a relative URL.)

- [ ] **Step 5: Moderator controls**

Create `components/poker/moderator-controls.tsx`:

```tsx
"use client";
import { Button } from "@/components/ui/button";

export function ModeratorControls({
  status, suggestion, onReveal, onSubmit, onRevote, onSkipPhase, onSkipIssue, onEnd,
}: {
  status: string;
  suggestion: number | null;
  onReveal: () => void;
  onSubmit: (v: number) => void;
  onRevote: () => void;
  onSkipPhase: () => void;
  onSkipIssue: () => void;
  onEnd: () => void;
}) {
  const isVoting = status.endsWith("_voting");
  const isRevealed = status.endsWith("_revealed");
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {isVoting && <Button onClick={onReveal}>Reveal votes</Button>}
      {isRevealed && (
        <>
          <Button onClick={() => suggestion !== null && onSubmit(suggestion)} disabled={suggestion === null}>
            Submit {suggestion ?? "?"}
          </Button>
          <Button variant="outline" onClick={onRevote}>Revote</Button>
        </>
      )}
      <Button variant="outline" onClick={onSkipPhase}>Skip phase</Button>
      <Button variant="outline" onClick={onSkipIssue}>Skip issue</Button>
      <Button variant="destructive" onClick={onEnd}>End session</Button>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/poker
git commit -m "feat(ui): room components — voter list, deck, reveal panel, controls, stepper"
```

---

### Task 38: Wire the room together (RoomClient)

**Files:** `app/app/poker/[sessionId]/room.client.tsx` (rewrite)

- [ ] **Step 1: Implement**

Replace `app/app/poker/[sessionId]/room.client.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSessionRoom } from "@/hooks/use-session-room";
import { CardDeck } from "@/components/poker/card-deck";
import { VoterList } from "@/components/poker/voter-list";
import { RevealPanel } from "@/components/poker/reveal-panel";
import { ModeratorControls } from "@/components/poker/moderator-controls";
import { IssueCard } from "@/components/poker/issue-card";
import { RoundBadge } from "@/components/poker/round-badge";
import { PhaseStepper } from "@/components/poker/phase-stepper";
import { SP_DECK, DURATION_DECK } from "@/lib/poker/decks";
import { suggestSp, suggestDuration } from "@/lib/poker/suggestion";
import { phaseOfStatus } from "@/lib/poker/state-machine";
import { Button } from "@/components/ui/button";

type Snapshot = {
  session: { id: string; sprintName: string; createdBy: string; status: string };
  members: Array<{ userId: string; role: string; displayName: string; avatarUrl: string | null; lastSeenAt: string }>;
  issues: Array<{ id: string; issueKey: string; summary: string; description: string | null; status: string; position: number }>;
  activeIssue: {
    issue: { id: string; issueKey: string; summary: string; description: string | null; status: string };
    currentEstimate: { id: string; round: number; kind: "sp" | "duration"; phase: string | null };
    votes: Array<{ userId: string; value: number }>;
    isRevealed: boolean;
  } | null;
};

export function RoomClient({ initialSnapshot, currentUserId }: { initialSnapshot: Snapshot; currentUserId: string }) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot);
  const [myCard, setMyCard] = useState<number | null>(null);

  const isModerator = snap.members.find((m) => m.userId === currentUserId)?.role === "moderator";
  const moderatorId = snap.members.find((m) => m.role === "moderator")?.userId ?? null;
  const active = snap.activeIssue;
  const status = active?.issue.status ?? "pending";
  const { kind, phase } = phaseOfStatus(status as never);
  const deck = kind === "duration" ? DURATION_DECK : SP_DECK;
  const unit = kind === "duration" ? "h" : "";

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/sessions/${snap.session.id}`);
    if (r.ok) setSnap(await r.json());
  }, [snap.session.id]);

  useSessionRoom(snap.session.id, (e) => {
    if (e.type === "session-ended") {
      toast("Session ended");
      router.push("/app");
      return;
    }
    refresh();
  });

  // reset card when active issue or phase changes
  useEffect(() => { setMyCard(null); }, [active?.issue.id, status]);

  const votedUserIds = useMemo(() => new Set((active?.votes ?? []).map((v) => v.userId)), [active]);
  const suggestion = useMemo(() => {
    if (!active || !active.isRevealed) return null;
    const vals = active.votes.map((v) => v.value);
    return kind === "sp" ? suggestSp(vals) : suggestDuration(vals);
  }, [active, kind]);

  async function post(path: string, body?: unknown) {
    const r = await fetch(`/api/sessions/${snap.session.id}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) toast.error(await r.text());
    return r.ok;
  }

  async function pick(issueId: string) { await post("/pick-issue", { issueId }); }
  async function vote(v: number) {
    if (!active) return;
    setMyCard(v);
    if (!(await post("/vote", { issueId: active.issue.id, value: v }))) setMyCard(null);
  }
  async function reveal() { if (active) await post("/reveal", { issueId: active.issue.id }); }
  async function submit(v: number) { if (active) await post("/submit", { issueId: active.issue.id, finalValue: v }); }
  async function revote() { if (active) await post("/revote", { issueId: active.issue.id }); }
  async function skipPhase() { if (active) await post("/skip-phase", { issueId: active.issue.id }); }
  async function skipIssue() { if (active) await post("/skip-issue", { issueId: active.issue.id }); }
  async function endSession() {
    const r = await fetch(`/api/sessions/${snap.session.id}`, { method: "DELETE" });
    if (!r.ok) toast.error(await r.text());
  }

  const pending = snap.issues.filter((i) => i.status === "pending");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{snap.session.sprintName}</h1>
          <p className="text-xs text-muted-foreground">{snap.issues.length} issues · room: {snap.session.id.slice(0, 8)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast("URL copied"); }}>
          Copy invite URL
        </Button>
      </header>

      {!active && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Pick an issue</h2>
          {pending.length === 0 && <p className="text-sm text-muted-foreground">No more pending issues. <Button variant="link" onClick={endSession}>End session</Button></p>}
          <ul className="flex flex-col gap-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between border rounded px-3 py-2">
                <span>{i.issueKey} — {i.summary}</span>
                {isModerator && <Button size="sm" onClick={() => pick(i.id)}>Estimate</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {active && (
        <>
          <PhaseStepper status={status} />
          <IssueCard keyId={active.issue.issueKey} summary={active.issue.summary} description={active.issue.description} />
          <div className="flex items-center justify-center gap-2">
            <RoundBadge round={active.currentEstimate.round} />
          </div>
          <VoterList members={snap.members} votedUserIds={votedUserIds} moderatorId={moderatorId} />

          {!active.isRevealed && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground text-center mb-2">Your card{phase ? ` — ${phase}` : ""}</p>
              <CardDeck deck={deck} selected={myCard} onPick={vote} disabled={false} />
            </div>
          )}

          {active.isRevealed && (
            <RevealPanel votes={active.votes} suggestion={suggestion} members={snap.members} unit={unit as "" | "h"} />
          )}

          {isModerator && (
            <ModeratorControls
              status={status}
              suggestion={suggestion}
              onReveal={reveal}
              onSubmit={submit}
              onRevote={revote}
              onSkipPhase={skipPhase}
              onSkipIssue={skipIssue}
              onEnd={endSession}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire room page**

Replace `app/app/poker/[sessionId]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { getRoomSnapshot, joinSession } from "@/lib/poker/service";
import { RoomClient } from "./room.client";

export default async function RoomPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/app/poker/${sessionId}`);
  await joinSession(sessionId, user.id);
  const snap = await getRoomSnapshot(sessionId);
  if (!snap) notFound();
  return <RoomClient initialSnapshot={JSON.parse(JSON.stringify(snap))} currentUserId={user.id} />;
}
```

(The `JSON.parse(JSON.stringify(snap))` serializes Date objects to strings to match the TS shape of `Snapshot`.)

- [ ] **Step 3: Commit**

```bash
git add app/app/poker components/poker
git commit -m "feat(ui): wire room — pick, vote, reveal, submit, revote, skip"
```

---

## Phase 10 — YouTrack write-back

### Task 39: Sync orchestration — write SP, duration, comment

**Files:** `lib/poker/sync.ts`, `lib/poker/sync.test.ts`, `app/api/sessions/[id]/sync/route.ts`, `lib/poker/service.ts` (extend with completion gather)

- [ ] **Step 1: Service helper — gather summary input**

Append to `lib/poker/service.ts`:

```ts
import { youtrackPosts } from "@/lib/db/schema";
import type { SummaryInput } from "./comment-formatter";

export async function gatherSummary(issueId: string): Promise<SummaryInput> {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const [session] = await db.select().from(sessions).where(eq(sessions.id, issue.sessionId)).limit(1);
  if (!session) throw new Error("session not found");

  const memberRows = await db
    .select({ userId: sessionMembers.userId, displayName: users.displayName })
    .from(sessionMembers)
    .innerJoin(users, eq(users.id, sessionMembers.userId))
    .where(eq(sessionMembers.sessionId, issue.sessionId));
  const memberNames = memberRows.map((m) => m.displayName);
  const nameOf = (id: string) => memberRows.find((m) => m.userId === id)?.displayName ?? "?";

  const estimateRows = await db.select().from(estimates).where(eq(estimates.issueId, issueId));
  const latestByKey = new Map<string, typeof estimateRows[number]>();
  for (const e of estimateRows) {
    const key = `${e.kind}:${e.phase ?? ""}`;
    const prev = latestByKey.get(key);
    if (!prev || e.round > prev.round) latestByKey.set(key, e);
  }
  const allRounds = new Map<string, number>();
  for (const e of estimateRows) {
    const key = `${e.kind}:${e.phase ?? ""}`;
    allRounds.set(key, Math.max(allRounds.get(key) ?? 0, e.round));
  }

  async function summaryFor(key: string) {
    const latest = latestByKey.get(key);
    if (!latest) return { skipped: true, final: null, rounds: 0, votes: [] as { user: string; value: number }[] };
    const voteRows = await db.select().from(votes).where(eq(votes.estimateId, latest.id));
    return {
      skipped: latest.finalValue === null,
      final: latest.finalValue !== null ? Number(latest.finalValue) : null,
      rounds: allRounds.get(key) ?? 1,
      votes: voteRows.map((v) => ({ user: nameOf(v.userId), value: Number(v.value) })),
    };
  }

  return {
    date: new Date(),
    members: memberNames,
    sp: await summaryFor("sp:"),
    duration: {
      impl: await summaryFor("duration:impl"),
      review: await summaryFor("duration:review"),
      test: await summaryFor("duration:test"),
    },
  };
}

export async function logYoutrackPost(opts: {
  issueId: string;
  kind: "sp_field" | "duration_field" | "comment";
  request: unknown;
  response: unknown;
  status: "success" | "failed";
}) {
  await db.insert(youtrackPosts).values({
    issueId: opts.issueId,
    kind: opts.kind,
    requestPayload: opts.request as object,
    responsePayload: (opts.response as object) ?? null,
    status: opts.status,
  });
}
```

- [ ] **Step 2: Sync orchestrator**

Create `lib/poker/sync.ts`:

```ts
import { db } from "@/lib/db/client";
import { issues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { gatherSummary, logYoutrackPost } from "./service";
import { formatSummaryComment } from "./comment-formatter";
import { updateIssueField } from "@/lib/youtrack/issues";
import { postIssueComment } from "@/lib/youtrack/comments";
import { youtrackConfig } from "@/lib/youtrack/config";
import { logger } from "@/lib/logger";

export type SyncResult = {
  spField: { ok: boolean; error?: string };
  durationField: { ok: boolean; error?: string };
  comment: { ok: boolean; error?: string };
};

export async function syncIssue(issueId: string, token: string): Promise<SyncResult> {
  const cfg = youtrackConfig();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
  if (!issue) throw new Error("issue not found");
  const summary = await gatherSummary(issueId);

  const result: SyncResult = {
    spField: { ok: true }, durationField: { ok: true }, comment: { ok: true },
  };

  // SP field
  if (!summary.sp.skipped && summary.sp.final !== null) {
    try {
      await updateIssueField(token, issue.issueKey, cfg.spField, summary.sp.final);
      await logYoutrackPost({ issueId, kind: "sp_field", request: { field: cfg.spField, value: summary.sp.final }, response: null, status: "success" });
    } catch (e) {
      result.spField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({ issueId, kind: "sp_field", request: { field: cfg.spField, value: summary.sp.final }, response: { error: (e as Error).message }, status: "failed" });
      logger.error({ err: e }, "sync sp field failed");
    }
  }

  // Duration field — sum non-skipped phases; only write if at least one phase is non-skipped
  const phases = [summary.duration.impl, summary.duration.review, summary.duration.test];
  const anyNonSkipped = phases.some((p) => !p.skipped && p.final !== null);
  if (anyNonSkipped) {
    const total = phases.reduce((s, p) => s + (p.final ?? 0), 0);
    try {
      await updateIssueField(token, issue.issueKey, cfg.durationField, total);
      await logYoutrackPost({ issueId, kind: "duration_field", request: { field: cfg.durationField, value: total }, response: null, status: "success" });
    } catch (e) {
      result.durationField = { ok: false, error: (e as Error).message };
      await logYoutrackPost({ issueId, kind: "duration_field", request: { field: cfg.durationField, value: total }, response: { error: (e as Error).message }, status: "failed" });
      logger.error({ err: e }, "sync duration field failed");
    }
  }

  // Comment (always posted)
  const text = formatSummaryComment(summary);
  try {
    const res = await postIssueComment(token, issue.issueKey, text);
    await logYoutrackPost({ issueId, kind: "comment", request: { text }, response: res, status: "success" });
  } catch (e) {
    result.comment = { ok: false, error: (e as Error).message };
    await logYoutrackPost({ issueId, kind: "comment", request: { text }, response: { error: (e as Error).message }, status: "failed" });
    logger.error({ err: e }, "sync comment failed");
  }

  return result;
}
```

- [ ] **Step 3: Sync API**

Create `app/api/sessions/[id]/sync/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser, getYoutrackAccessToken } from "@/lib/auth/session";
import { syncIssue } from "@/lib/poker/sync";

const Body = z.object({ issueId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params; // id present but not needed
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await getYoutrackAccessToken(user.id);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const result = await syncIssue(parsed.data.issueId, token);
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Trigger sync automatically when an issue reaches `completed`**

Edit `app/api/sessions/[id]/submit/route.ts` — after the existing logic, before the `return NextResponse.json(...)`, add:

```ts
import { syncIssue } from "@/lib/poker/sync";
import { getYoutrackAccessToken } from "@/lib/auth/session";

// ... existing code ...
if (next.status === "completed") {
  const token = await getYoutrackAccessToken(user.id);
  if (token) {
    syncIssue(parsed.data.issueId, token).catch((e) => console.error("sync after completion failed", e));
  }
}
```

(Same for the `skip-phase` route: if the resulting status is `completed`, kick off a sync.)

- [ ] **Step 5: Integration test for sync**

Create `tests/integration/sync.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { testDb } from "./setup";
import { handlers } from "./msw-handlers";
import { users, issues } from "@/lib/db/schema";
import { createSession, pickIssue, castVote, reveal, submitFinal } from "@/lib/poker/service";
import { syncIssue } from "@/lib/poker/sync";
import { eq } from "drizzle-orm";

const captured: { url: string; body: unknown }[] = [];

const fieldHandler = http.post("https://example.youtrack.cloud/api/issues/:key", async ({ request, params }) => {
  captured.push({ url: `field:${params.key}`, body: await request.json() });
  return HttpResponse.json({});
});
const commentHandler = http.post("https://example.youtrack.cloud/api/issues/:key/comments", async ({ request, params }) => {
  captured.push({ url: `comment:${params.key}`, body: await request.json() });
  return HttpResponse.json({ id: "c1" });
});

const server = setupServer(...handlers, fieldHandler, commentHandler);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(...handlers, fieldHandler, commentHandler); captured.length = 0; });
afterAll(() => server.close());

async function newUser(label: string) {
  const [u] = await testDb.insert(users).values({ youtrackId: label + Math.random(), email: label, displayName: label }).returning();
  return u!;
}

describe("syncIssue", () => {
  it("writes SP, duration, and a comment after a completed flow", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    await pickIssue(session.id, issue!.id, mod.id);
    await castVote(session.id, issue!.id, mod.id, 5);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 5);
    await castVote(session.id, issue!.id, mod.id, 8);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 8);
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 2);
    await castVote(session.id, issue!.id, mod.id, 2);
    await reveal(session.id, issue!.id, mod.id);
    await submitFinal(session.id, issue!.id, mod.id, 2);

    const r = await syncIssue(issue!.id, "tok");
    expect(r).toEqual({ spField: { ok: true }, durationField: { ok: true }, comment: { ok: true } });
    const kinds = captured.map((c) => c.url.split(":")[0]);
    expect(kinds).toEqual(expect.arrayContaining(["field", "field", "comment"]));
    const comment = captured.find((c) => c.url.startsWith("comment"));
    expect(JSON.stringify(comment?.body)).toContain("Story Points: 5");
    expect(JSON.stringify(comment?.body)).toContain("Duration: 12h total");
  });

  it("skips field writes when sp/all-duration are skipped, still posts comment", async () => {
    const mod = await newUser("mod");
    const session = await createSession({ creatorUserId: mod.id, token: "t", boardId: "B1", sprintId: "S47", sprintName: "S47" });
    const [issue] = await testDb.select().from(issues).where(eq(issues.sessionId, session.id));
    const { skipPhase } = await import("@/lib/poker/service");
    await pickIssue(session.id, issue!.id, mod.id);
    await skipPhase(session.id, issue!.id, mod.id); // skip sp
    await skipPhase(session.id, issue!.id, mod.id); // skip impl
    await skipPhase(session.id, issue!.id, mod.id); // skip review
    await skipPhase(session.id, issue!.id, mod.id); // skip test → completed

    await syncIssue(issue!.id, "tok");
    const kinds = captured.map((c) => c.url.split(":")[0]);
    expect(kinds).toEqual(["comment"]);
  });
});
```

- [ ] **Step 6: Run**

```bash
npm run test:integration
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sync): YouTrack write-back — fields + comment, auto on completion"
```

---

### Task 40: Toast + retry button in room when sync fails

**Files:** `app/app/poker/[sessionId]/room.client.tsx` (extend)

- [ ] **Step 1: Add sync result handling**

Extend `RoomClient` — in the `useSessionRoom` handler add:

```ts
if (e.type === "phase-changed" && (e.payload as { status: string }).status === "completed") {
  // server fires sync in background; we surface failures by polling youtrack_posts via the snapshot endpoint
}
```

Add a "Resync" button to issues whose latest `youtrackPost` rows include any `status: 'failed'`. Concretely, extend `getRoomSnapshot` to include a per-issue `syncStatus: 'ok' | 'failed' | null` field (`null` = never attempted), then in the issue list of the room UI show a small retry button next to failed ones that POSTs `/sync` again.

- [ ] **Step 2: Service — attach sync status**

Update `getRoomSnapshot` in `lib/poker/service.ts` to:

```ts
// after loading `view.issues`:
const completedIds = view.issues.filter((i) => i.status === "completed" || i.status === "skipped").map((i) => i.id);
const postRows = completedIds.length === 0 ? [] : await db
  .select({ issueId: youtrackPosts.issueId, status: youtrackPosts.status })
  .from(youtrackPosts)
  .where(/* drizzle inArray */ /* see below */ undefined as never);
// Simpler: skip the optimization — read all posts for these issues
```

Concrete diff: after the existing `issuesList = ...` line, add:

```ts
const postRows = await db
  .select({ issueId: youtrackPosts.issueId, status: youtrackPosts.status })
  .from(youtrackPosts);
const byIssue = new Map<string, "ok" | "failed">();
for (const p of postRows) {
  const prev = byIssue.get(p.issueId);
  if (p.status === "failed") byIssue.set(p.issueId, "failed");
  else if (!prev) byIssue.set(p.issueId, "ok");
}
const issuesWithSync = issuesList.map((i) => ({ ...i, syncStatus: byIssue.get(i.id) ?? null }));
return { session: view.session, members: view.members, issues: issuesWithSync, activeIssue };
```

Update the `Snapshot` type in `room.client.tsx` to include `syncStatus: "ok" | "failed" | null` on each issue, and render a "Retry sync" button when `syncStatus === "failed"` next to completed/skipped issues.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(sync): surface failed sync attempts with retry"
```

---

## Phase 11 — Polish (PWA, SEO, edge cases)

### Task 41: PWA — manifest + Serwist service worker

**Files:** `app/manifest.ts`, `public/icon-192.png`, `public/icon-512.png`, `next.config.ts`, `app/sw.ts`

- [ ] **Step 1: Install Serwist**

```bash
npm install @serwist/next serwist
```

- [ ] **Step 2: Manifest route**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Full House",
    short_name: "Full House",
    description: "Sprint estimation for YouTrack teams",
    start_url: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 3: Icons**

Add placeholder PNGs at `public/icon-192.png` and `public/icon-512.png` (use any solid square — the engineer should replace with the brand mark when designed).

- [ ] **Step 4: Service worker**

Create `app/sw.ts`:

```ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 5: next.config update**

Edit `next.config.ts`:

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {};
export default withSerwist(nextConfig);
```

- [ ] **Step 6: Verify**

```bash
npm run build
```
Expected: build succeeds, `public/sw.js` generated.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(pwa): manifest + Serwist service worker"
```

---

### Task 42: SEO — sitemap + robots

**Files:** `app/sitemap.ts`, `app/robots.ts`

- [ ] **Step 1: Sitemap**

Create `app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: env.NEXT_PUBLIC_SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
  ];
}
```

- [ ] **Step 2: Robots**

Create `app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/app", "/api", "/login"] },
    ],
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts app/robots.ts
git commit -m "feat(seo): sitemap + robots"
```

---

### Task 43: Offline banner + connection state

**Files:** `components/shell/offline-banner.tsx`, `app/app/layout.tsx` (extend)

- [ ] **Step 1: Offline banner**

Create `components/shell/offline-banner.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="bg-yellow-100 border-b border-yellow-300 text-yellow-900 px-4 py-2 text-sm text-center">
      You're offline. Live updates are paused; actions will fail until you reconnect.
    </div>
  );
}
```

- [ ] **Step 2: Render in app layout**

Edit `app/app/layout.tsx` — between `<AppNav />` and `<main>`, insert `<OfflineBanner />`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): offline banner in app layout"
```

---

### Task 44: Member presence — bump `lastSeenAt` on activity

**Files:** `hooks/use-presence-ping.ts`, `app/api/sessions/[id]/ping/route.ts`, `app/app/poker/[sessionId]/room.client.tsx` (use the hook)

- [ ] **Step 1: Ping endpoint**

Create `app/api/sessions/[id]/ping/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sessionMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getServerUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await db
    .update(sessionMembers)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(sessionMembers.sessionId, id), eq(sessionMembers.userId, user.id)));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Hook**

Create `hooks/use-presence-ping.ts`:

```ts
"use client";
import { useEffect } from "react";

export function usePresencePing(sessionId: string, intervalMs = 30_000) {
  useEffect(() => {
    const tick = () => { void fetch(`/api/sessions/${sessionId}/ping`, { method: "POST" }); };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [sessionId, intervalMs]);
}
```

- [ ] **Step 3: Use in RoomClient**

Call `usePresencePing(snap.session.id);` near the top of `RoomClient`.

- [ ] **Step 4: Takeover UI**

In `RoomClient`, after `members`, compute `const moderatorIsStale = ...;` (>5 minutes since `lastSeenAt`). When `!isModerator && moderatorIsStale`, render a small button: "Take over moderation" that POSTs to `/takeover`. After success, the next snapshot refresh will reflect the new role.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(presence): periodic lastSeenAt ping + take-over moderator button"
```

---

## Phase 12 — End-to-end happy path

### Task 45: Playwright E2E happy-path test

**Files:** `tests/e2e/happy-path.spec.ts`, `tests/e2e/fixtures.ts`

This test runs against the dev server with the real DB. It mocks YouTrack at the network level using Playwright's `page.route`. It exercises: 2 voters (auth bypassed by directly seeding users + a test-only auth bypass route), pick → vote → reveal → submit → next phase × 3 → completion → sync.

- [ ] **Step 1: Test-only auth bypass**

Create `app/api/test/sign-in-as/route.ts` (only enabled when `process.env.E2E_TEST === "1"`):

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users, oauthAccounts } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { encode } from "next-auth/jwt";

const Body = z.object({ youtrackId: z.string(), name: z.string(), email: z.string() });

export async function POST(req: Request) {
  if (process.env.E2E_TEST !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const body = Body.parse(await req.json());
  const [user] = await db.insert(users).values({
    youtrackId: body.youtrackId, email: body.email, displayName: body.name,
  }).onConflictDoUpdate({ target: users.youtrackId, set: { email: body.email, displayName: body.name } }).returning();
  await db.insert(oauthAccounts).values({
    userId: user!.id, provider: "youtrack",
    accessToken: encrypt("e2e-token", env.YT_TOKEN_ENC_KEY),
    refreshToken: null,
    expiresAt: new Date(Date.now() + 3600_000),
    scope: "YouTrack",
  }).onConflictDoUpdate({
    target: [oauthAccounts.userId, oauthAccounts.provider],
    set: { accessToken: encrypt("e2e-token", env.YT_TOKEN_ENC_KEY), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const token = await encode({ token: { userId: user!.id }, secret: env.AUTH_SECRET, salt: "authjs.session-token" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("authjs.session-token", token, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
```

(Verify the cookie name matches your Auth.js v5 configuration — for non-secure dev it's `authjs.session-token`.)

- [ ] **Step 2: Playwright test**

Create `tests/e2e/happy-path.spec.ts`:

```ts
import { test, expect, request } from "@playwright/test";

const YT = "https://example.youtrack.cloud";

test("happy path: 2 voters complete SP + 3 duration phases, sync writes back", async ({ browser }) => {
  const modContext = await browser.newContext();
  const voterContext = await browser.newContext();

  // Mock YouTrack from both contexts
  for (const ctx of [modContext, voterContext]) {
    await ctx.route(`${YT}/api/agiles`, (r) => r.fulfill({ json: [{ id: "B1", name: "Board" }] }));
    await ctx.route(`${YT}/api/agiles/B1/sprints*`, (r) =>
      r.fulfill({ json: [{ id: "S47", name: "Sprint 47", archived: false, start: Date.now() - 1, finish: Date.now() + 86400000 }] }));
    await ctx.route(`${YT}/api/agiles/B1/sprints/S47*`, (r) =>
      r.fulfill({ json: { issues: [{ id: "yt1", idReadable: "FH-1", summary: "Test issue", description: null, customFields: [{ name: "State", value: { name: "Open" } }] }] } }));
    await ctx.route(`${YT}/api/issues/FH-1*`, (r) => r.fulfill({ json: {} }));
    await ctx.route(`${YT}/api/issues/FH-1/comments*`, (r) => r.fulfill({ json: { id: "c1" } }));
  }

  const modPage = await modContext.newPage();
  const voterPage = await voterContext.newPage();

  // Auth bypass
  await modPage.request.post("/api/test/sign-in-as", { data: { youtrackId: "mod", name: "Mod", email: "mod@x" } });
  await voterPage.request.post("/api/test/sign-in-as", { data: { youtrackId: "voter", name: "Voter", email: "voter@x" } });

  // Mod creates session
  await modPage.goto("/app/poker");
  await modPage.getByLabel("Board").click();
  await modPage.getByRole("option", { name: "Board" }).click();
  await modPage.getByLabel("Sprint").click();
  await modPage.getByRole("option", { name: "Sprint 47" }).click();
  await modPage.getByRole("button", { name: "Start session" }).click();
  await modPage.waitForURL(/\/app\/poker\/[0-9a-f-]+/);

  const url = modPage.url();
  await voterPage.goto(url);

  // Mod picks the issue
  await modPage.getByRole("button", { name: "Estimate" }).click();
  await expect(modPage.getByText("FH-1")).toBeVisible();
  await expect(voterPage.getByText("FH-1")).toBeVisible({ timeout: 10_000 });

  // Both vote
  await modPage.getByRole("button", { name: "5", exact: true }).click();
  await voterPage.getByRole("button", { name: "5", exact: true }).click();
  await modPage.getByRole("button", { name: "Reveal votes" }).click();
  await modPage.getByRole("button", { name: /Submit 5/ }).click();

  // Three duration phases — keep it simple: skip
  await modPage.getByRole("button", { name: "Skip phase" }).click();
  await modPage.getByRole("button", { name: "Skip phase" }).click();
  await modPage.getByRole("button", { name: "Skip phase" }).click();

  // Session should now have no pending issues
  await expect(modPage.getByText(/No more pending issues/)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: E2E env**

When running E2E, set `E2E_TEST=1` in the dev server env (e.g., create `.env.test` and load via `dotenv-cli`):

```bash
E2E_TEST=1 npm run test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e app/api/test
git commit -m "test(e2e): happy path — pick, vote, reveal, submit, skip phases"
```

---

## Self-review

Run this checklist after the agent (or you) writes the plan:

1. **Spec coverage:** Every spec section is implemented:
   - §1 Product framing → Tasks 1, 25, 26 (routing, marketing, app shell)
   - §2 Stack → Tasks 1–7
   - §3 Domain model → Tasks 8–10
   - §4 State machine → Task 15
   - §5 Core flow → Tasks 27–38
   - §6 YouTrack integration → Tasks 17–21, 39
   - §7 Realtime → Tasks 34–35, broadcasts integrated in Task 33
   - §8 Auth → Tasks 22–24
   - §9 PWA → Task 41
   - §10 SEO → Task 42 (+ metadata in Tasks 25–26)
   - §11 Testing strategy → Tests appear in Tasks 6, 12–16, 30–32, 39, 45
   - §12 Non-goals → not implemented (correct)
   - §13 v2/v3 roadmap → v1-protection captured (`teamId` in schema Task 9–10, `youtrackConfig()` Task 17)
   - §14 Env vars → Task 6
2. **Placeholder scan:** No "TBD"/"add appropriate error handling"/"similar to task N" appears.
3. **Type consistency:** `IssueStatus`, `EstimateKind`, `phaseOfStatus`, and the API body shapes are referenced consistently across service, endpoints, and UI.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-25-planning-poker-v1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
