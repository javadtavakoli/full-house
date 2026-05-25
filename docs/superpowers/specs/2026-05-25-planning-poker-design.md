# Full House — Planning Poker (v1) Design

**Status:** Approved for implementation planning
**Date:** 2026-05-25
**Author:** Javad (with Claude)

## 1. Product framing

**Full House** is a toolset of sprint utilities. v1 ships a single tool — **Planning Poker** — but the surrounding shell (auth, navigation, account settings, tool registry) is designed so future tools (retro board, standup helper, sprint health, etc.) can be added without restructuring routes, auth, or data layout.

Routing layout:

| Path | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Marketing landing, SEO-indexed |
| `/login`, `/auth/youtrack/callback` | Public | YouTrack OAuth flow |
| `/app` | Authenticated | Dashboard: list of tools, recent activity |
| `/app/poker` | Authenticated | Poker tool home: board → sprint picker, "start session" |
| `/app/poker/[sessionId]` | Session members | The estimation room |

Public pages are server-rendered with full metadata for SEO. Authenticated pages set `noindex`. A PWA manifest covers the whole app; install prompt surfaces from the dashboard.

## 2. Stack

Locked by prior decisions:

- **Next.js 15 App Router** + **TypeScript strict**
- **Auth.js v5** with a **custom YouTrack OAuth provider** (~½ day of work — the YouTrack Hub OAuth flow is not a one-line config)
- **Pusher Channels** for realtime broadcasts (private channels, server-signed auth endpoint)
- **Neon Postgres** (free tier, native Vercel integration, branch-per-preview)
- **Vercel** deploy

Picked here (push back during review if you disagree):

- **Drizzle ORM** — lighter than Prisma, faster cold starts on serverless, better TS inference, no codegen step.
- **Tailwind v4 + shadcn/ui** for UI primitives.
- **Serwist** for the PWA service worker (next-pwa is unmaintained for App Router).
- **TanStack Query** for client-side cache around REST endpoints; React Server Components for initial loads.
- **Vitest** (unit) + **Playwright** (E2E happy path: create session → vote → reveal → submit → YouTrack mock).
- **Pino** for structured logs.
- **Zod** for request/response validation at API boundaries.

## 3. Domain model

Postgres schema (Drizzle):

```
users
  id (uuid, pk)
  youtrack_id (text, unique)
  email (text)
  display_name (text)
  avatar_url (text, nullable)
  created_at (timestamptz)

oauth_accounts
  user_id (uuid, fk users)
  provider (text)                      -- 'youtrack'
  access_token (text, encrypted)        -- AES-GCM, key from env
  refresh_token (text, encrypted, nullable)
  expires_at (timestamptz)
  scope (text)

sessions
  id (uuid, pk)
  created_by (uuid, fk users)
  board_id (text)                       -- YouTrack agile board id
  sprint_id (text)
  sprint_name (text)
  status (text)                         -- 'active' | 'ended'
  created_at (timestamptz)
  ended_at (timestamptz, nullable)

session_members
  session_id (uuid, fk sessions)
  user_id (uuid, fk users)
  role (text)                           -- 'moderator' | 'voter'
  joined_at (timestamptz)
  last_seen_at (timestamptz)
  primary key (session_id, user_id)

issues
  id (uuid, pk)
  session_id (uuid, fk sessions)
  youtrack_issue_id (text)
  issue_key (text)                      -- e.g. 'FH-1242'
  summary (text)
  description (text, nullable)
  position (int)                        -- ordering within the session
  status (text)                         -- see state machine below
  created_at (timestamptz)
  unique (session_id, youtrack_issue_id)

estimates
  id (uuid, pk)
  issue_id (uuid, fk issues)
  kind (text)                           -- 'sp' | 'duration'
  phase (text, nullable)                -- null for sp; 'impl' | 'review' | 'test' for duration
  round (int, default 1)                -- incremented on revote; round-1 rows kept for history
  final_value (numeric, nullable)       -- null = phase skipped
  decided_by (uuid, fk users, nullable) -- null until moderator submits
  decided_at (timestamptz, nullable)

votes
  id (uuid, pk)
  estimate_id (uuid, fk estimates)
  user_id (uuid, fk users)
  value (numeric)                       -- the chosen card
  cast_at (timestamptz)
  unique (estimate_id, user_id)         -- one vote per user per round

youtrack_posts
  id (uuid, pk)
  issue_id (uuid, fk issues)
  kind (text)                           -- 'sp_field' | 'duration_field' | 'comment'
  request_payload (jsonb)
  response_payload (jsonb)
  status (text)                         -- 'success' | 'failed'
  attempted_at (timestamptz)
```

Why this shape:

- **Append-only `estimates` + `votes` per round.** Revoting creates a new `estimates` row with `round = n+1`; old rounds remain queryable. Same mechanism supports v2 phase editing (just append another row for the same `(issue_id, kind, phase)`; "current" = highest round).
- **Skipped phase** = `estimates` row with `final_value = null` and `decided_by` set.
- **`youtrack_posts`** is an audit log of every write to YouTrack — useful for debugging field-mapping errors and re-trying failed writes.

## 4. Issue state machine

Each issue progresses through these states inside a session. Linear flow with two kinds of branches: **revote** (loops back to the same voting state with `round++`) and **skip** (jumps past the current step without setting a final value).

```
                 ┌─ revote ──┐
                 ▼           │
pending → sp_voting → sp_revealed ──┐
                                    │ submit or skip
                                    ▼
                 ┌─ revote ──┐
                 ▼           │
            dur_impl_voting → dur_impl_revealed ──┐
                                                  │ submit or skip
                                                  ▼
                 ┌─ revote ──┐
                 ▼           │
            dur_review_voting → dur_review_revealed ──┐
                                                      │ submit or skip
                                                      ▼
                 ┌─ revote ──┐
                 ▼           │
            dur_test_voting → dur_test_revealed → completed
```

Transitions allowed at every step:

| Action | From | To |
| --- | --- | --- |
| Reveal | any `*_voting` | matching `*_revealed` |
| Revote | any `*_revealed` | matching `*_voting`, `round++` |
| Submit final | any `*_revealed` | next step (or `completed` if last) |
| Skip phase | any `*_voting` or `*_revealed` | next step (or `completed` if last); writes `estimates` row with `final_value = null` |
| Skip issue | any state except `completed` | `skipped` (issue-level, distinct from "skip phase") |

The session ends when the moderator clicks "End session" or every issue is `completed` / `skipped`.

## 5. Core flow (user-facing)

1. **Sign in.** User visits `/`, clicks "Sign in with YouTrack" → OAuth round-trip → lands on `/app`.
2. **Start session.** User opens `/app/poker`, picks a board (dropdown of their YouTrack boards), picks a sprint (default-selected: next non-archived sprint after the active one). Clicks "Start session".
3. **Room opens.** They are routed to `/app/poker/[sessionId]` and become the moderator. The room URL is copyable; they share it via Slack / wherever.
4. **Members join.** Other users open the URL, sign in if needed, and join as voters. The room shows everyone present.
5. **Pick an issue.** Moderator sees the sprint's unestimated issues (default filter: hide `Done`-state issues; toggle to show all). They click one — it becomes the active issue and is broadcast to everyone.
6. **SP voting.** Layout A (Stage): the issue title/description is front and center; voters' avatars sit around it with ✓ (voted) or … (not yet). The voter's own hand of cards (pure Fibonacci: 1, 2, 3, 5, 8, 13, 21) is at the bottom. Their selection is private until reveal; other voters only see whether they've voted.
7. **Reveal.** Moderator clicks "Reveal votes". All cards flip simultaneously, grouped by value with voter names. Suggested SP = **mode** (most-selected value). Suggestion rules:
   - Single mode → suggest it.
   - Tie between two or more values → suggest the **highest** of the tied values (conservative).
   - No mode (all unique values) → suggest the **median**, rounded up to the nearest deck card.
8. **Moderator decides.** Three actions: **Submit final** (input prefilled with suggestion; can override to any card), **Revote** (clears the current round's votes, returns to voting state, `round++` visible), **Skip phase** (skip SP entirely — moves directly to the implementation phase).
9. **Duration phases.** SP submit transitions to `dur_impl_voting`. Same flow as SP but with the duration deck (1h, 2h, 4h, 8h, 16h, 24h). Suggested value = **average snapped to nearest deck card** (ties round up; single vote = that value). Each phase can be **revoted** or **skipped** independently. Skipped phases contribute 0 to the total.
10. **YouTrack sync.** After the test phase (or after the last non-skipped step), the app writes:
    - **SP field:** updated only if SP was not skipped. If skipped, the field is left untouched.
    - **Duration field:** updated with the sum of non-skipped phases. If **all three** phases were skipped, the duration field is left untouched.
    - **Comment:** posted always, even if everything was skipped (shows what happened in the session — see §6 format).
    - On failure: shows a toast with retry; session DB state is already saved; failure logged in `youtrack_posts`.
11. **Next issue.** Moderator picks the next issue or ends the session.

### Edge cases handled in v1

| Case | Behavior |
| --- | --- |
| Moderator refreshes / loses connection | Reconnects to the same session; role intact (DB-backed). |
| Moderator gone >5 min (`last_seen_at`) | Any member sees "Take over moderation" button; click promotes them. |
| Voter joins mid-vote | Can cast a vote until reveal; doesn't reset others. |
| Voter changes vote pre-reveal | Allowed; last value wins (votes table has unique on `(estimate_id, user_id)`, upsert). |
| Member disconnects during reveal | On reconnect, REST fetches current state; resubscribes to Pusher channel. |
| YouTrack write fails | Toast + retry button; final values persisted in our DB regardless. |
| Two moderators click "Reveal" simultaneously | Server is source of truth — second write becomes a no-op (state already `revealed`). |
| YouTrack token expired | Refresh via `oauth_accounts.refresh_token`; on failure prompt re-auth. |

## 6. YouTrack integration

**Instance:** YouTrack Cloud (`<workspace>.youtrack.cloud`). Workspace URL configured per deployment via `YT_BASE_URL`.

**Auth:** Hub OAuth 2.0 authorization-code flow. The OAuth app is registered in the customer's YouTrack Hub. Required scopes: `YouTrack` (read issues, write fields and comments). Tokens stored AES-GCM-encrypted in `oauth_accounts`; encryption key from `YT_TOKEN_ENC_KEY` env var.

**API endpoints used:**

| Purpose | Endpoint |
| --- | --- |
| List boards | `GET /api/agiles?fields=id,name` |
| List sprints | `GET /api/agiles/{boardId}/sprints?fields=id,name,archived,start,finish` |
| List sprint issues | `GET /api/agiles/{boardId}/sprints/{sprintId}?fields=issues(id,idReadable,summary,description,customFields(name,value(name)))` |
| Update field | `POST /api/issues/{idReadable}?fields=customFields(name,value)` with `customFields` body |
| Post comment | `POST /api/issues/{idReadable}/comments?fields=id,text` |

**Field configuration:** Field names are configured per deployment via env vars (you'll supply the actual names):

- `YT_SP_FIELD` — e.g. `"Story Points"`
- `YT_DURATION_FIELD` — e.g. `"Estimation"`
- `YT_DONE_STATE_NAMES` — comma-separated list of "done" state names to filter (e.g. `"Done,Won't fix"`)

**Comment format (single comment per estimation pass; re-running appends a new comment):**

```
Estimated via Full House on 2026-05-25 by Javad, Sara, Reza, Mehdi, Lia.

Story Points: 5  (rounds: 2)
  1 — Mehdi
  3 — Sara, Reza
  5 — Javad
  8 — Lia

Duration: 12h total
  Implementation: 8h
    4h — Sara
    8h — Javad, Reza, Mehdi
    16h — Lia
  Review: 2h
    1h — Sara
    2h — Javad, Reza
    4h — Mehdi, Lia
  Test: 2h
    1h — Mehdi
    2h — Javad, Sara, Reza, Lia
  (Implementation revoted 1×)
```

Skipped SP appears as `Story Points: skipped`. Skipped duration phases appear as e.g. `Review: skipped` (not summed into total). If every duration phase is skipped, the line reads `Duration: skipped`.

## 7. Realtime architecture

**Service:** Pusher Channels. One **private channel per session**: `private-session-{sessionId}`. Auth endpoint at `/api/pusher/auth` checks the requester is in `session_members` for that session.

**Source of truth:** The server. Clients send actions over REST (`POST /api/sessions/{id}/vote`, etc.); the server validates, persists, and then broadcasts via Pusher. Clients never trust each other directly.

**Events (server → clients):**

| Event | Payload | When |
| --- | --- | --- |
| `member-joined` / `member-left` | `{ userId, displayName, avatarUrl }` | Member presence change |
| `presence-updated` | `{ memberIds: [...] }` | Periodic (every 30s) heartbeat |
| `issue-changed` | `{ issueId, key, summary, description }` | Moderator picks a new issue |
| `phase-changed` | `{ issueId, status, round }` | State machine transitions |
| `vote-cast` | `{ userId }` (value withheld) | A vote was recorded; updates "voted" indicator |
| `votes-revealed` | `{ estimateId, votes: [{ userId, value }], suggestion }` | Moderator reveals |
| `final-submitted` | `{ estimateId, finalValue, decidedBy }` | Moderator submits final |
| `phase-skipped` | `{ estimateId }` | Moderator skips phase |
| `youtrack-synced` | `{ issueId, ok, error? }` | After YouTrack write attempt |
| `session-ended` | `{}` | Moderator ends session |

**Client behavior:** Optimistic UI on the voter who voted (their own card highlights immediately); everyone else updates on broadcast.

## 8. Auth

**Provider:** Custom YouTrack OAuth provider for Auth.js v5. The provider:

1. Sends user to `https://<workspace>.youtrack.cloud/hub/api/rest/oauth2/auth?...` with `response_type=code`.
2. Receives the code at `/auth/youtrack/callback`.
3. Exchanges it for an access + refresh token at `/hub/api/rest/oauth2/token`.
4. Calls `/hub/api/rest/users/me?fields=id,name,login,email,avatarUrl` to get user identity.
5. Upserts the user (matched by `youtrack_id`) and stores the encrypted tokens.

**Sessions:** Auth.js JWT session (no DB session table needed beyond `users` and `oauth_accounts`). JWT carries `userId` only; we hit Postgres to get user details where needed.

**Authorization rules:**

- Anyone authenticated can create a session and becomes its moderator.
- Joining a session: open. Anyone with the URL who is authenticated can join.
- Moderator-only actions: pick issue, reveal, submit final, skip phase, end session.
- Moderator handoff: implicit if current moderator has not been seen for 5 minutes; any member can take over.

## 9. PWA

- **Manifest:** name, short_name, icons (192/512), `display: standalone`, theme color.
- **Service worker (Serwist):** caches the app shell + static assets (JS/CSS/fonts/images) with stale-while-revalidate. **Does not cache API responses** — collaboration requires fresh data.
- **No offline mode.** When offline, the app shows a "you're offline" banner and disables actions.
- **No push notifications in v1** (good v2 candidate).

## 10. SEO

- `/` (landing) is SSR'd with full `<head>` metadata: title, description, OG tags, canonical, JSON-LD `SoftwareApplication` schema.
- Public pages emit `index, follow`.
- All `/app/*` routes emit `noindex, nofollow` via the route metadata API.
- `sitemap.xml` and `robots.txt` generated by the App Router file conventions.

## 11. Testing strategy

- **Unit (Vitest):** state machine reducer, suggestion math (mode for SP; avg-snapped-to-deck for duration), comment formatter, YouTrack payload builders.
- **Integration (Vitest + testcontainers Postgres):** Drizzle queries, OAuth callback, session lifecycle endpoints.
- **E2E (Playwright):** create session → 3 mock voters cast → reveal → submit → mocked YouTrack receives the field + comment. Mock YouTrack via MSW.
- **No mocks for the DB in integration tests** — real Postgres via testcontainers.

## 12. Non-goals for v1

Stated explicitly so we don't drift:

- Editing phases after the session ends (data supports it; UI is v2).
- Past-sessions history UI (sessions stored, no list/detail screen).
- Estimated-vs-actual analytics.
- Push notifications.
- Multi-tenant / multi-org (single team per deployment; YouTrack workspace = identity boundary).
- Tools beyond Planning Poker (shell is ready; future tools are separate work).
- Self-hosted YouTrack support (cloud only).
- T-shirt-size or custom SP scales (pure Fibonacci only).
- Configurable duration deck (1h / 2h / 4h / 8h / 16h / 24h, fixed).
- Capacity-aware assignment of reviewer / assignee (v2 — see §13).

## 13. v2 roadmap (notes, not designs)

These are captured here so v1 schema and integration choices don't paint us into a corner. Each gets its own design pass when prioritized.

### 13.1 Capacity-aware reviewer / assignee assignment

After the session has settled SP and per-phase duration estimates, the moderator should be able to assign an **assignee** (responsible for `impl`) and a **reviewer** (responsible for `review`) to each issue — with the app suggesting candidates that actually fit the sprint.

The suggestion engine needs three inputs:

1. **Sprint working days** — start/end of the sprint minus weekends, holidays, and individual time-off. YouTrack agile boards expose sprint start/finish; holidays/time-off need either a new input UI or a YouTrack field convention to read from.
2. **Per-person capacity** — a configured % (e.g. 70%) of working hours each member can spend on sprint work (the rest goes to meetings, support, etc.). Stored in a new `user_capacities` table keyed by `(user_id, sprint_id)` with a per-user default that's editable per sprint.
3. **Estimated time per role** — already in `estimates`: `impl` hours feed the assignee's load, `review` hours feed the reviewer's load. Test phase is unassigned in v2 (could become `tester` in v3).

The UI shows, for the currently selected issue, each candidate with their **remaining capacity** (`(working_hours × capacity%) − sum of impl/review already assigned to them this sprint`). Negative numbers are highlighted red. Picking an assignee/reviewer writes back to YouTrack's Assignee field (and a new "Reviewer" custom field — `YT_REVIEWER_FIELD` env var).

**Schema additions this will need (heads-up, not v1 work):**

```
user_capacities       (user_id, sprint_id, capacity_pct, hours_off, notes)
issue_assignments     (issue_id, role 'assignee'|'reviewer', user_id, assigned_at, assigned_by)
sprint_calendar       (sprint_id, working_days int, holidays jsonb)
```

**Open questions to resolve when v2 starts:**

- Where do holidays and individual time-off come from? (Manual UI? YouTrack time-tracking? Calendar integration?)
- Does the suggestion engine optimize globally (Hungarian algorithm across all issues) or greedily (issue-at-a-time)? Greedy is simpler and matches the moderator's mental model; global is more accurate.
- How is "remaining capacity" affected by issues outside the current session that are already in the sprint? (Read existing YouTrack assignments at session start; treat as fixed load.)

## 14. Environment variables

## 13. Environment variables

```
DATABASE_URL                  # Neon Postgres connection string
AUTH_SECRET                   # Auth.js JWT secret
YT_BASE_URL                   # e.g. https://example.youtrack.cloud
YT_OAUTH_CLIENT_ID
YT_OAUTH_CLIENT_SECRET
YT_OAUTH_REDIRECT_URI         # https://<deployment>/auth/youtrack/callback
YT_TOKEN_ENC_KEY              # AES-GCM key (32 bytes, base64)
YT_SP_FIELD                   # e.g. "Story Points"
YT_DURATION_FIELD             # e.g. "Estimation"
YT_DONE_STATE_NAMES           # comma-separated, e.g. "Done,Won't fix"
PUSHER_APP_ID
PUSHER_KEY
PUSHER_SECRET
PUSHER_CLUSTER
NEXT_PUBLIC_PUSHER_KEY
NEXT_PUBLIC_PUSHER_CLUSTER
NEXT_PUBLIC_SITE_URL          # for SEO canonical/OG
```
