# FIFA Winner Predictor

A device-bound prediction app for FIFA matches with an admin portal, leaderboard, and automatic point calculation. I'll build this on Lovable Cloud (our managed Postgres + auth + functions) using the project's TanStack Start + React stack. The spec mentions Node/Express/Redux/MUI — I'll adapt to the stack this project actually runs on (TanStack Start + React + Tailwind + shadcn), which gives the same capabilities with less setup.

## Scope

### Public app (no login)
- First visit: prompt for a username; store a generated `deviceId` in `localStorage`. Username is permanent for that device, uniqueness enforced server-side.
- Returning visit: auto-load profile by `deviceId`.
- Home: list of matches grouped by status (Prediction Open, Upcoming, Live, Completed) with team names, flags (emoji from country code or uploaded URL), competition, kickoff, countdown.
- Prediction window: opens 24h before kickoff, closes at kickoff. Outside the window: show "Predictions open in X" or locked state with the user's existing pick.
- Three-choice picker: Team 1 Win / Draw / Team 2 Win. One pick per match per user, editable until lock.
- User dashboard: total predictions, correct, points, accuracy, current rank.
- Leaderboard: rank, name, points, correct, total, accuracy. Live-ish via polling/realtime.
- Dark mode + responsive FIFA-style design.

### Admin portal (`/admin`)
- Username/password gate using server-side env vars `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Session via httpOnly signed cookie (TanStack `useSession`).
- Matches CRUD, status toggle (Upcoming / Live / Completed / Cancelled — "Prediction Open" is derived from time).
- Enter final result (score for each team). System derives winner (team1/draw/team2), awards 1 point to matching predictions, marks match completed.
- Recalculate points (idempotent rebuild from results).
- Users list: username, deviceId, registered date, totals; disable/enable user.
- Predictions list + CSV export.

## Data model (Lovable Cloud / Postgres)

```text
users(id uuid pk, username text unique, device_id text unique,
      disabled boolean default false, created_at timestamptz)
matches(id uuid pk, team1 text, team1_flag text, team2 text, team2_flag text,
        competition text, kickoff timestamptz,
        status text check in ('upcoming','live','completed','cancelled'),
        team1_score int null, team2_score int null,
        winner text null check in ('team1','draw','team2'),
        created_at timestamptz)
predictions(id uuid pk, match_id uuid fk, user_id uuid fk,
            pick text check in ('team1','draw','team2'),
            is_correct boolean null, points int default 0,
            created_at timestamptz, updated_at timestamptz,
            unique(match_id, user_id))
```

Leaderboard is a SQL view aggregating predictions (no separate table needed; simpler + always correct).

RLS: tables are written only via server functions using the service role. Public read access via narrow `anon` SELECT policies on `matches` and the leaderboard view. `users` and `predictions` are read through server functions scoped by `deviceId`.

## Server functions (TanStack `createServerFn`)
- `registerUser({ username, deviceId })` — create or fetch; enforces uniqueness with clear error.
- `getMe({ deviceId })` — returns profile + stats + rank.
- `listMatches()` — public.
- `submitPrediction({ deviceId, matchId, pick })` — validates window (24h before kickoff, before kickoff, match not completed/cancelled, user not disabled).
- `getMyPredictions({ deviceId })`.
- `getLeaderboard()` — public.
- Admin (require admin cookie): `adminLogin`, `adminLogout`, `adminCreateMatch`, `adminUpdateMatch`, `adminDeleteMatch`, `adminSetStatus`, `adminSetResult` (computes winner, updates predictions, awards points atomically), `adminListUsers`, `adminToggleUserDisabled`, `adminListPredictions`, `adminExportPredictions`, `adminRecalculatePoints`.

## Routes
- `/` — home (matches + countdowns + predict)
- `/leaderboard`
- `/me` — user dashboard
- `/admin` — login + admin shell
- `/admin/matches`, `/admin/results`, `/admin/users`, `/admin/predictions`

## Secrets
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (for cookie encryption).

## Out of scope (per spec)
- No score/player predictions, no bonus points, no email/OTP, no real-time push beyond polling.

## Build order
1. Enable Lovable Cloud, add admin secrets.
2. Migrations: tables, indexes, leaderboard view, RLS + grants.
3. Server functions (public + admin) with auth middleware.
4. Frontend: design system (FIFA-inspired: deep green/navy, gold accents, bold display font, dark mode), shared layout, username gate, home, leaderboard, dashboard.
5. Admin portal.
6. SEO: titles/meta per route, sitemap, robots.
