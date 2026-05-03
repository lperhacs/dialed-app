# Dialed Brain
*Shared project context for Claude Code and Cowork — update after every session*
*Last updated: May 2, 2026 (later)*

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
- **No new features until retention is validated** — testers need to
  prove the daily logging loop sticks before anything else is built.
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
- **Joint buddy streak** — both buddies log ≥1 habit on the same calendar day (each in their own tz). One number both partners own. Include 1 freeze per 14 days, push when at-risk ("Joe hasn't logged today, your 23-day streak ends at midnight"). Reinforces shared-accountability thesis and is natively shareable. Risk if shipped now: muddies the retention signal — won't know if loop sticks because of buddies-as-they-are or because of streaks.

## Do NOT do these without a strategy conversation first
- Migrate to Postgres
- Add new features
- Change existing API contracts
- Open to public or remove TestFlight gate
- Change JWT signing format / payload shape (existing TestFlight tokens would break;
  current tokens use `token_version` for selective invalidation on password change)

## Strategy session log
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
