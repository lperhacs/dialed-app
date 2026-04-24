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
- **Club delete button** — Club creators now have a delete button (trash icon) in the club action row with a confirmation dialog. (`ChallengeDetailScreen.jsx`)
- **Auto-delete empty clubs** — When the last member leaves a club, it is automatically deleted. Works both from the club detail screen and the clubs list. (`ChallengeDetailScreen.jsx`, `ChallengesScreen.jsx`)
- **First-time tab walkthrough** — New users see a 5-slide guided tour on first launch explaining the feed, habit tracking, events, clubs, and buddy system. Dismissed via "Skip" or "Got it" and never shown again. (`TabTour.jsx`, `TabNavigator.jsx`)
- **Followers / Following lists** — Tapping the Followers or Following count on any profile navigates to a list of those users. Tapping a user in the list goes to their profile. (`FollowListScreen.jsx`, `ProfileScreen.jsx`, `RootNavigator.jsx`)
- **X times per week/month habits** — Habits now support a target count (e.g. "4 days a week"). The calendar shows exactly that many dots per week — no more, no less — so users always see their goal, not a full 7-day grid. The log button shows live progress ("Log This Week · 2/4") and stays tappable until the goal is hit. (`HabitCalendar.jsx`, `HabitsScreen.jsx`, `backend/routes/habits.js`, `backend/utils/streaks.js`)
- **Push notifications** — Full Expo push notification system. Device token registered on login and stored per-user. Push fires for: cheers, comments, follows, DMs, buddy requests, buddy accepted. Per-type toggles in Settings let users control exactly what they receive. (`backend/utils/push.js`, `utils/notifications.js`, `AuthContext.jsx`, `SettingsScreen.jsx`)

### Bug Fixes (from tester feedback)
- **Negative timestamps** — Post and comment timestamps showed "-25076s" due to clock drift. Fixed by clamping to 0 and standardizing format to "just now / 2m ago / 3h ago". Extracted into shared `utils/timeAgo.js` used across all 6 screens.
- **Email validation** — Invalid emails (e.g. missing @) were only caught on submit. Now validated inline on blur with a red error message below the field. (`RegisterScreen.jsx`, `OnboardingDeclaration.jsx`)
- **Habit calendar looked like checkboxes** — Empty squares had a border and square corners. Changed to filled dots (no border) so the grid reads as a history view. (`HabitCalendar.jsx`)
- **Day 0 on posts** — First habit log showed "Day 0" on the post. Clamped to minimum Day 1 at source and in display. (`HabitsScreen.jsx`, `PostCard.jsx`, `CommentsScreen.jsx`)

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
