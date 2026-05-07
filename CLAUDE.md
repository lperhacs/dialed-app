# Dialed Brain
*Shared project context for Claude Code and Cowork — update after every session*
*Last updated: May 7, 2026*

## Core retention values
*The behaviors and feelings that, if present, predict a user sticks. Every feature decision should serve at least one.*
1. **Daily log habit formed** — user opens the app and logs at the same time each day without a push prompt (the app becomes a routine, not a reminder)
2. **Active buddy partnership** — at least one accepted, mutually-logging buddy. The single strongest predictor of D30 retention. A user with no buddy is on a path to churn.
3. **Visible consequence to missing** — buddy/follower will see the miss. Without social stake, the streak is just a number to abandon.
4. **First-week streak ≥ 3 days** — early momentum predicts long-term adherence. If a user breaks before day 3, retention drops sharply.
5. **One identity moment per week** — earning a badge, hitting a streak milestone, getting a buddy nudge, being celebrated in the feed. Without this, the app feels like a chore tracker.
6. **A reason to come back same-day** — buddy logged, friend posted, RSVP got a comment, nudge received. Pull, not just push.


## What this app is
Accountability-based social fitness app called Dialed.
Core loop: create a habit → invite a buddy → log daily → your buddy sees when you don't.

## Target user
Fitness, self-help, and accountability-focused people.
Think Strava meets a gym buddy.

## Core mechanics
- Group challenges — primary acquisition and onboarding entry point
- Buddy pairing — friend-based (not stranger matching), core retention mechanic
- Daily habit logging with social feed
- Streak + badge system — consequence for missing logs
- Public commitment visible to followers

## Current status
- Fully built and live on Railway + TestFlight
- Active testers on iOS
- Pre-launch — focus is retention validation, not new features

## Tech stack
### Backend
- Node.js 22+ + Express — REST API
- SQLite via `node:sqlite` (Node built-in, `--experimental-sqlite`) — single file DB
  - **No `db.transaction()`** — use `db.exec('BEGIN IMMEDIATE')` / `COMMIT` / `ROLLBACK`
- Railway — hosting and deploys
- helmet — security headers (added May 2, 2026)

### Mobile
- React Native + Expo SDK 52
- Expo Router / React Navigation
- EAS Build + TestFlight distribution

### Auth
- JWT (jsonwebtoken)
- bcrypt password hashing
- OTP placeholder (Twilio-ready)

### Payments
- RevenueCat — stubbed, not yet active

### Infrastructure
- GitHub — source control
- Railway — backend + SQLite hosting
- Expo EAS — mobile build pipeline
- Apple TestFlight — beta distribution

## Active decisions and rationale
- **Staying on SQLite for now** — concurrent load not yet a problem.
  Migrate to Postgres after real user traction.
  Immediate action: confirm SQLite file is on Railway persistent volume.
- **Build features when asked, no strategy gate required** — when the user
  explicitly asks to add something, just build it. Do not push back citing
  the retention-validation rule. That rule is retired.
- **Group challenges are the onboarding entry point** — works without
  an existing social graph, users find buddies through challenges.
- **Buddy pairing is the retention mechanic** — friend-based stakes
  are stickier than stranger matching.

## Current priorities
1. ~~Confirm SQLite persistent volume is configured on Railway~~ ✅ Done May 2 —
   500MB volume mounted at `/data`, `DB_PATH=/data/dialed.db`, backup cron writes
   to `/data/backups` (default of `path.dirname(DB_PATH)/backups`). Service migrated
   from EU West (Amsterdam) to US East (Virginia) for better US-tester latency.
2. Email verification flow (still on the security TODO list — not yet built)
3. Instrument and monitor tester retention and daily logging drop-off
4. Identify where users fall off in onboarding
5. Fix retention issues before expanding tester pool

## Post-retention-validation backlog
*Do not build until daily-logging retention is validated. These ideas are parked here so they aren't lost.*
- ~~**Joint buddy streak**~~ — Shipped May 3, 2026 (build 26). See strategy log below.
- **Sunday weekly recap push** — `/api/recap/weekly` and `WeeklyRecapScreen.jsx` already exist but are hidden behind a button most testers never tap. Convert from pull → push: hourly cron fires when it's ~9am Sunday in user's local tz, writes a `weekly_recap` notification row + sends push, deep-linking to the recap screen. Persists in inbox so users can revisit. Hits retention values #5 (identity moment per week) and #6 (reason to come back). Implementation reuses `dailyHabitReminders.js` timezone pattern; recap endpoint needs to accept `?week=YYYY-Www` so taps on past recaps render the right week. Skip first-week users (no data) and zero-log weeks (sending a 0-stat recap to a churned user backfires). Risk if shipped now: same as above — adds a new re-engagement vector that contaminates the baseline retention signal we're trying to measure.

## Do NOT do these without a strategy conversation first
- Migrate to Postgres
- Change existing API contracts
- Open to public or remove TestFlight gate
- Change JWT signing format / payload shape (existing TestFlight tokens would break;
  current tokens use `token_version` for selective invalidation on password change)

## Feature development rules
- **Build when asked** — if the user asks for a feature, build it immediately. No pushback.
- **Triple-test every feature before considering it done** — mentally walk through
  the full user flow at least 3 times, check all edge cases (empty state, error state,
  loading state, both light and dark mode), and verify backend + mobile are in sync.
  Do not ship a feature with known gaps or untested paths.

## Strategy session log
### May 7, 2026 — Builds 33–34 (audit fixes + photo post bug + carousel dots)
- Full end-to-end audit run (builds 33–34). Key bugs found and fixed:
- **Photo posts with habits → 500 server error** (CRITICAL): Mobile was appending both `images` (array) and `image` (single) fields. `upload.array('images')` throws `LIMIT_UNEXPECTED_FILE` on any unexpected field name. Fixed by switching backend to `upload.fields([{name:'images',maxCount:10},{name:'image',maxCount:1}])` with deduplication.
- **New posts not appearing in feed**: CreatePostScreen never called `invalidateCache('/posts')` after successful post. Fixed.
- **Friends-only events with cover photos silently became public**: FormData sends string `"false"` which is truthy in JS. Mobile now sends `'1'`/`'0'`; backend normalizes both boolean and string values for `is_public`.
- **Profile carousels missing**: GET /:username/posts only returned legacy `image_url`/`video_url`, not `post_media` rows. Fixed with batch query joining all post IDs.
- **Carousel dots no active state**: All dots rendered identically. Fixed with `activeCarouselIndex` state + `onScroll` handler + accent color/larger size for active dot.
- **Follow-back button**: Added to notifications center for follow-type notifications. Backend returns `is_following_back` via LEFT JOIN on follows table.
- **club_event notifications**: Had no icon; tapping navigated nowhere. Added calendar icon and `Events` screen navigation with `highlightEventId`.
- **Nudge button**: Shows spinner and disables during in-flight request.
- Other fixes: db.js schema missing columns for fresh installs, awardBadges non-fatal try/catch, null-checks on user before bcrypt, computeJointStreak bounded to 400 days, OpenMaps using correct iOS/Android URL scheme, MediaViewer crash on unmounted ref.
- **Audit methodology updated**: Audits must trace full request path — mobile field names → multer/parser config → handler → DB columns → response shape. Not just response shape alone.

### May 6, 2026 — Build 31 (multi-reminder Pro + avatar fix)
- Third "no new features" rule override (after joint streak and the ad-hoc
  bug fixes). User explicitly authorized shipping a paid multi-reminder
  feature mid-session: Pro users get up to 10 reminders per habit, free
  users stay at 1. Same retention-signal contamination risk applies;
  decision stands because the gate is a Pro upsell, not a retention lever.
- Schema: new `habit_reminders (id, user_id, habit_id, time_of_day)` table.
  One-shot backfill on startup copies any legacy `habits.reminder_time`
  value in so existing reminders survive. `habits.reminder_time` is still
  written (first entry) for back-compat with older mobile builds.
- Backend: `replaceReminders()` helper in routes/habits.js validates the
  count vs `users.is_pro`. New `GET/PUT /habits/:id/reminders` plus the
  array travels through `GET/POST/PUT /habits`. Free-cap exceedances
  return `{ error, pro_gate: true }` so the mobile can route to paywall.
- Mobile: replaced single TimePicker with `RemindersField` chip list;
  scheduling uses composite identifier `habit:<id>:<HH:MM>` so each time
  has its own slot the cancel pass can clean up. Legacy single-id
  reminders are still cancelled correctly. Paywall now lists the cap.
- Avatar fix: PATCH /users/me/avatar previously stored the full base64
  data URL in users.avatar_url. Every Pulse Check page joined that
  column for every author → multi-MB JSON, RN <Image /> failing to
  render large data URIs. Now writes the bytes to `/uploads/avatar-*`
  on the persistent volume and stores the path. Startup migration
  converts existing data: rows so testers don't have to re-upload.
- CreatePostScreen: `keyboardVerticalOffset 40 → 0` so the keyboard no
  longer covers the Photo/Video toolbar in the iOS modal stack.

### May 3, 2026 (later) — Joint buddy streak shipped (override of "no new features" rule)
- Decided to ship joint buddy streak now (was in post-retention-validation backlog).
  Acknowledged contamination risk to retention signal; user's call was to ship anyway.
- Implementation: `last_freeze_used_at TEXT` column on buddies; `computeJointStreak`
  in routes/buddies.js now lazily applies a freeze on a single missed joint day,
  enforces 1-per-rolling-14-days, and persists the freeze date so it can't be
  re-used. New cron `cron/jointStreakAtRisk.js` runs hourly, fires at 8pm local
  in each user's tz when streak ≥ 2 and today isn't yet a joint day. Mobile shows
  blue "freeze used" badge on Profile buddy card when relevant.
- Trade-off: now harder to attribute D7/D30 retention shifts purely to the daily
  loop. Mitigation: keep watching `/api/analytics/funnel` and the new
  `joint_streak_at_risk` notifications counts to see if the streak is actually
  driving log-back behavior.

### May 3, 2026 — Build 25 (crash + function audit)
- Build-23 testers crashing on app open. Crash signature `RCTNativeModule.mm:234`
  + `objc_exception_rethrow` indicates a JS-to-native bridge rethrow — runs
  before the React ErrorBoundary mounts. Prime suspect identified:
  `Notifications.setNotificationHandler` in `mobile/src/utils/notifications.js`
  ran at module-load time. Wrapped in try/catch so a fragile-state notifications
  module can't brick app launch.
- Wired global JS error reporter via `ErrorUtils.setGlobalHandler` → POSTs to
  new `/api/analytics/jserror` (no-auth, rate-limited). Captures any post-launch
  crash with full stack. Admin view at `/api/analytics/jserrors` (x-analytics-key).
- Fixed theme system: `userInterfaceStyle: "automatic"` in app.json (was "dark")
  so `useColorScheme()` actually reflects iOS Dark/Light/Auto.
- Removed weekly recap button from HomeScreen header — recap is push-only on
  Sundays per CLAUDE.md backlog.
- 8 defensive bug fixes from full crash audit (4 parallel agents): null/typeof
  guards in mobile (ThemeContext, RootNavigator, HabitsScreen TimePicker,
  CommentsScreen, ProfileScreen, notifications.js) + backend (events.js
  display_name fallback, habits.js buildStreakCalendar wrong-arg fix).

### May 2, 2026 (later) — Persistence + region + bug pass
- Confirmed Railway persistent volume: 500MB at `/data`, `DB_PATH=/data/dialed.db`,
  backups go to `/data/backups` automatically. SQLite + base64 avatars now durable
  across deploys. CLAUDE.md priority #1 closed.
- Migrated service+volume from EU West to US East (Virginia). Railway auto-migrated
  volume contents — no data loss, brief downtime. Latency for US testers should drop
  from ~150ms to ~30–60ms.
- Mobile bug fixes:
  - **Pin button on Profile** wasn't reflecting state — `setFeaturedHabit` updated
    backend but didn't `invalidateCache` the cached `/users/:username` profile, so
    the reload returned stale data. Fixed.
  - **Profile photos invisible** — mobile uploaded avatars via `PUT /users/profile`
    (multipart → file written to `/uploads/*` on disk). Pre-volume those files were
    wiped each deploy. Switched mobile to `PATCH /users/me/avatar` which stores
    base64 inside the DB row (already existed, was unused). Old `/uploads/*` avatars
    are gone for good — testers will see initial-letter placeholder until re-upload.
  - **Buddy button** was disabled when active — no in-app way to unpair. Made it
    tappable for both pending (cancel request) and active (remove buddy) with a
    confirm dialog to prevent accidents.

### May 2, 2026 — Pre-launch security audit (Sprints 1–3)
- Ran full audit; resolved 38 issues across 3 commits (cf24550, 2273ce0, bf6fd91)
- Decided to introduce JWT `token_version` for selective invalidation on password
  change (vs. force-logging-out all current testers). Missing version in old JWTs
  treated as 0 so existing tokens stay valid.
- Helmet added to backend (replaces hand-rolled headers)
- DB backup rewritten to use `VACUUM INTO` (WAL-safe). Persistent-volume question
  on Railway remains open and is now blocking real DR confidence.
- Daily reminder cron switched from fixed UTC times to hourly + per-user-timezone
  dispatch. Worth watching Railway resource use after deploy.
- Caller behavior changes shipped (mobile must handle): `POST /auth/send-otp`
  now requires Bearer auth; `PATCH /me/password` and `POST /me/email/confirm`
  return a fresh `token` that mobile must replace.

### April 29, 2026 — Founding strategy session
- Validated the app concept and core loop
- Decided group challenges are acquisition, buddy pairing is retention
- Confirmed auto-post when missing a habit should be opt-in only, not default
- Stack reviewed and approved as-is
- SQLite migration to Postgres deferred until real user load
- CLAUDE.md system established — Cowork maintains it, Claude Code reads it
- Cowork + Claude Code + CLAUDE.md is the shared context system going forward

## End of session update instructions
At the end of every Claude Code or Cowork session update this file:
- Today's date in Last updated
- Any new decisions added to Strategy session log with date
- Any priority changes
- Any tech stack changes
