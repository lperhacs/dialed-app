# Dialed Brain
*Shared project context for Claude Code and Cowork — update after every session*
*Last updated: May 2, 2026*

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
1. Confirm SQLite persistent volume is configured on Railway
   (backup code now uses `VACUUM INTO` — correct, but useless if the volume is ephemeral)
2. Email verification flow (still on the security TODO list — not yet built)
3. Instrument and monitor tester retention and daily logging drop-off
4. Identify where users fall off in onboarding
5. Fix retention issues before expanding tester pool

## Do NOT do these without a strategy conversation first
- Migrate to Postgres
- Add new features
- Change existing API contracts
- Open to public or remove TestFlight gate
- Change JWT signing format / payload shape (existing TestFlight tokens would break;
  current tokens use `token_version` for selective invalidation on password change)

## Strategy session log
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
