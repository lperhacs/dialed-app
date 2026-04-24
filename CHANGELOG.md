# Dialed Changelog

---

## V2 — In Progress

### Bug Fixes
- **Follow button UI** — Follow/Unfollow button now updates instantly after tapping. Previously the button stayed stuck until navigating away and back. (`ProfileScreen.jsx`)
- **Habit → share to feed pre-fill** — After logging a habit, tapping "Share to Feed" now auto-fills the draft message and attaches the habit. Users just hit Post. (`CreatePostScreen.jsx`)

### New Features
- **Tappable posts** — Tapping a post's content or image opens a detail view showing the full post at the top with the comment thread below. (`PostCard.jsx`, `CommentsScreen.jsx`)
- **@mention hyperlinks** — Any @username tag in posts or comments is now a tappable link that navigates to that user's profile. (`PostCard.jsx`, `CommentsScreen.jsx`)
- **Multi-habit onboarding** — Users can now select multiple habits during signup. All selected habits are created at registration and shown in the step 2 summary. (`OnboardingDeclaration.jsx`)

---

## V1 — Submitted to TestFlight April 19, 2026 (Build 8)

Initial alpha build submitted for external TestFlight review.

### Features at launch
- Habit tracking (daily, weekly, monthly) with streaks
- Habit calendar (completion grid)
- Share habit logs to social feed
- Milestone celebrations (Day 7, 30, 100, etc.)
- Follow friends, see their habits and posts
- Cheers and comments on posts
- @mentions in posts and comments
- DM / conversations
- Buddy system (accountability partner)
- Badges and leaderboard
- Onboarding flow
- Light and dark mode
