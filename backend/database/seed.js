require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

const db = getDb();

console.log('🌱 Seeding Dialed database...\n');

// Clear existing data
db.exec(`
  DELETE FROM notifications;
  DELETE FROM badges;
  DELETE FROM challenge_habit_links;
  DELETE FROM challenge_members;
  DELETE FROM challenges;
  DELETE FROM comments;
  DELETE FROM likes;
  DELETE FROM posts;
  DELETE FROM habit_logs;
  DELETE FROM habits;
  DELETE FROM follows;
  DELETE FROM users;
`);

// --- USERS ---
const users = [
  { id: uuidv4(), username: 'alex_rn', email: 'alex@dialed.app', display_name: 'Alex Rivera', bio: 'Building habits, one day at a time. 🔥 Morning runner + cold shower devotee.', password: 'password123' },
  { id: uuidv4(), username: 'jess_lifts', email: 'jess@dialed.app', display_name: 'Jessica Tan', bio: 'Powerlifter. Meditator. Proving streaks > motivation every single day.', password: 'password123' },
  { id: uuidv4(), username: 'marco_dev', email: 'marco@dialed.app', display_name: 'Marco Silva', bio: 'Software engineer by day, night-runner by... night. On a 200-day coding streak 😅', password: 'password123' },
  { id: uuidv4(), username: 'priya_yoga', email: 'priya@dialed.app', display_name: 'Priya Kapoor', bio: 'Yoga instructor. 365-day meditation practitioner. Your nervous system will thank you.', password: 'password123' },
  { id: uuidv4(), username: 'jay_eats', email: 'jay@dialed.app', display_name: 'Jay Park', bio: 'Nutrition nerd. Tracking macros so I can eat more pizza guilt-free.', password: 'password123' },
];

for (const u of users) {
  const password_hash = bcrypt.hashSync(u.password, 10);
  db.prepare(
    'INSERT INTO users (id, username, email, password_hash, display_name, bio) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(u.id, u.username, u.email, password_hash, u.display_name, u.bio);
}
console.log(`✅ Created ${users.length} users`);

const [alex, jess, marco, priya, jay] = users;

// --- FOLLOWS ---
const followPairs = [
  [alex.id, jess.id], [alex.id, marco.id], [alex.id, priya.id],
  [jess.id, alex.id], [jess.id, priya.id], [jess.id, jay.id],
  [marco.id, alex.id], [marco.id, jess.id],
  [priya.id, alex.id], [priya.id, jess.id], [priya.id, jay.id],
  [jay.id, marco.id], [jay.id, alex.id],
];
for (const [a, b] of followPairs) {
  db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(a, b);
}
console.log(`✅ Created ${followPairs.length} follow relationships`);

// --- HABITS ---
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const habits = [
  { id: uuidv4(), user_id: alex.id, name: 'Morning Run', description: '5km every morning before 8am', frequency: 'daily', color: '#f97316', created_at: daysAgo(60) },
  { id: uuidv4(), user_id: alex.id, name: 'Cold Shower', description: 'At least 2 min cold', frequency: 'daily', color: '#3b82f6', created_at: daysAgo(45) },
  { id: uuidv4(), user_id: jess.id, name: 'Strength Training', description: '4x per week lifting session', frequency: 'daily', color: '#ef4444', created_at: daysAgo(90) },
  { id: uuidv4(), user_id: jess.id, name: 'Meditation', description: '10 minutes mindfulness', frequency: 'daily', color: '#8b5cf6', created_at: daysAgo(120) },
  { id: uuidv4(), user_id: marco.id, name: 'Code Something', description: 'At least 30 min of personal projects', frequency: 'daily', color: '#22c55e', created_at: daysAgo(200) },
  { id: uuidv4(), user_id: priya.id, name: 'Yoga Practice', description: 'Morning flow, minimum 20 min', frequency: 'daily', color: '#ec4899', created_at: daysAgo(365) },
  { id: uuidv4(), user_id: priya.id, name: 'Journaling', description: 'Evening reflection', frequency: 'daily', color: '#f59e0b', created_at: daysAgo(200) },
  { id: uuidv4(), user_id: jay.id, name: 'Track Macros', description: 'Log all meals in app', frequency: 'daily', color: '#14b8a6', created_at: daysAgo(50) },
  { id: uuidv4(), user_id: jay.id, name: 'Weekly Meal Prep', description: 'Sunday meal prep session', frequency: 'weekly', color: '#f97316', created_at: daysAgo(60) },
];

for (const h of habits) {
  db.prepare(
    'INSERT INTO habits (id, user_id, name, description, frequency, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(h.id, h.user_id, h.name, h.description, h.frequency, h.color, h.created_at);
}
console.log(`✅ Created ${habits.length} habits`);

const [alexRun, alexShower, jessLift, jessMed, marcoCode, priyaYoga, priyaJournal, jayMacros, jayPrep] = habits;

// --- HABIT LOGS (generate streak data) ---
function logHabit(habitId, userId, daysBack, note = '') {
  db.prepare('INSERT INTO habit_logs (id, habit_id, user_id, note, logged_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), habitId, userId, note, daysAgo(daysBack));
}

// Alex run — 42 day streak
for (let i = 0; i <= 42; i++) logHabit(alexRun.id, alex.id, i, i === 0 ? 'PB today! 21:30 5k 🔥' : '');
// Alex cold shower — 30 day streak
for (let i = 0; i <= 30; i++) logHabit(alexShower.id, alex.id, i);

// Jess lift — strong streak with a gap 2 weeks ago
for (let i = 0; i <= 5; i++) logHabit(jessLift.id, jess.id, i);
for (let i = 8; i <= 75; i++) logHabit(jessLift.id, jess.id, i);
// Jess meditation — 118 day streak
for (let i = 0; i <= 118; i++) logHabit(jessMed.id, jess.id, i, i === 0 ? 'Best session in weeks 🧘' : '');

// Marco code — 198 day streak
for (let i = 0; i <= 198; i++) logHabit(marcoCode.id, marco.id, i, i === 0 ? 'Built a little CLI tool today' : '');

// Priya yoga — 360 day streak!
for (let i = 0; i <= 360; i++) logHabit(priyaYoga.id, priya.id, i, i === 0 ? 'Year streak incoming 🙏' : '');
// Priya journaling — 195 day streak
for (let i = 0; i <= 195; i++) logHabit(priyaJournal.id, priya.id, i);

// Jay macros — 32 day streak
for (let i = 0; i <= 32; i++) logHabit(jayMacros.id, jay.id, i);
// Jay meal prep — weekly, 8 weeks
for (let i = 0; i <= 56; i += 7) logHabit(jayPrep.id, jay.id, i);

console.log(`✅ Created habit logs`);

// --- BADGES ---
const badgesData = [
  { user_id: alex.id, badge_type: 'first_step' },
  { user_id: alex.id, badge_type: 'week_warrior' },
  { user_id: alex.id, badge_type: 'on_fire' },
  { user_id: alex.id, badge_type: 'iron_will' },
  { user_id: jess.id, badge_type: 'first_step' },
  { user_id: jess.id, badge_type: 'week_warrior' },
  { user_id: jess.id, badge_type: 'on_fire' },
  { user_id: jess.id, badge_type: 'iron_will' },
  { user_id: marco.id, badge_type: 'first_step' },
  { user_id: marco.id, badge_type: 'week_warrior' },
  { user_id: marco.id, badge_type: 'on_fire' },
  { user_id: marco.id, badge_type: 'iron_will' },
  { user_id: marco.id, badge_type: 'century' },
  { user_id: priya.id, badge_type: 'first_step' },
  { user_id: priya.id, badge_type: 'week_warrior' },
  { user_id: priya.id, badge_type: 'on_fire' },
  { user_id: priya.id, badge_type: 'iron_will' },
  { user_id: priya.id, badge_type: 'century' },
  { user_id: jay.id, badge_type: 'first_step' },
  { user_id: jay.id, badge_type: 'week_warrior' },
  { user_id: jay.id, badge_type: 'on_fire' },
  { user_id: jay.id, badge_type: 'iron_will' },
];
for (const b of badgesData) {
  db.prepare('INSERT OR IGNORE INTO badges (id, user_id, badge_type) VALUES (?, ?, ?)').run(uuidv4(), b.user_id, b.badge_type);
}
console.log(`✅ Created badges`);

// --- POSTS ---
const postsData = [
  { id: uuidv4(), user_id: alex.id, content: 'Day 42 of my morning run streak. Never thought I\'d make it this far. The hardest part isn\'t the run — it\'s getting out of bed. But once you\'re out there, you\'re unstoppable. 🔥', habit_id: alexRun.id, habit_day: 42 },
  { id: uuidv4(), user_id: jess.id, content: 'Day 118 of daily meditation. My anxiety is basically extinct at this point. If you\'re struggling — start with 2 minutes. Seriously.', habit_id: jessMed.id, habit_day: 118 },
  { id: uuidv4(), user_id: marco.id, content: 'Day 198 of coding every single day. Built a Rust CLI tool today for parsing my running logs. The streak has made me a better engineer than any bootcamp ever could.', habit_id: marcoCode.id, habit_day: 198 },
  { id: uuidv4(), user_id: priya.id, content: 'Day 360. ONE more day and I hit a full year of daily yoga. I started this because I couldn\'t touch my toes. Now I\'m doing handstands in the park. Consistency > talent. 🙏', habit_id: priyaYoga.id, habit_day: 360 },
  { id: uuidv4(), user_id: jay.id, content: 'Meal prep Sunday hits different when you\'re consistent. 5 lunches + 3 dinners in 2 hours. The 8-week streak is real. Saved probably $300 this month too.', habit_id: jayPrep.id, habit_day: 8 },
  { id: uuidv4(), user_id: alex.id, content: 'Cold shower tip: Don\'t think about it. The hesitation is worse than the cold itself. Just turn the knob. Works for most hard things in life, honestly.' },
  { id: uuidv4(), user_id: jess.id, content: 'Hit a new squat PR today — 140kg. 6 months ago I was at 100kg. The compound effect of consistent training is absolutely wild.' },
  { id: uuidv4(), user_id: marco.id, content: 'Streak accountability check: did you log your habit today? The best time was earlier. The second best time is RIGHT NOW.' },
  { id: uuidv4(), user_id: priya.id, content: 'Morning flow done ✅ 6am, sun just coming up, birds outside. This is what it\'s all about.' },
  { id: uuidv4(), user_id: jay.id, content: 'Macro tracking revelation: I was eating 600 extra calories a day in "healthy" snacks. No wonder nothing was changing. Track everything for at least 2 weeks.' },
];

for (const p of postsData) {
  db.prepare(
    'INSERT INTO posts (id, user_id, content, habit_id, habit_day, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(p.id, p.user_id, p.content, p.habit_id || null, p.habit_day || 0, daysAgo(Math.floor(Math.random() * 10)));
}
console.log(`✅ Created ${postsData.length} posts`);

// --- LIKES ---
const allPostIds = postsData.map(p => p.id);
const allUserIds = users.map(u => u.id);

for (const postId of allPostIds) {
  // Random 2-4 users like each post
  const likers = allUserIds.filter(() => Math.random() > 0.5);
  for (const userId of likers) {
    db.prepare('INSERT OR IGNORE INTO likes (id, user_id, post_id) VALUES (?, ?, ?)').run(uuidv4(), userId, postId);
  }
}
console.log(`✅ Created likes`);

// --- COMMENTS ---
const commentsData = [
  { post_id: postsData[0].id, user_id: jess.id, content: 'LET\'S GO ALEX! Day 50 is going to feel incredible 🔥' },
  { post_id: postsData[0].id, user_id: marco.id, content: 'The accountability on this app keeps me going too. Day 42 is huge!' },
  { post_id: postsData[1].id, user_id: priya.id, content: 'This is so true. I teach yoga and the mental side is always harder than the physical. Proud of you 🙏' },
  { post_id: postsData[2].id, user_id: alex.id, content: 'Rust AND a 198 day streak? You\'re built different man.' },
  { post_id: postsData[3].id, user_id: alex.id, content: 'Can\'t wait to see your Day 365 post. Gonna be legendary.' },
  { post_id: postsData[3].id, user_id: jay.id, content: 'This is insane. Full year of yoga, every day?? You\'re an inspiration.' },
  { post_id: postsData[4].id, user_id: jess.id, content: 'Meal prep is so underrated. Game changer for consistency.' },
];

for (const c of commentsData) {
  db.prepare('INSERT INTO comments (id, user_id, post_id, content) VALUES (?, ?, ?, ?)').run(uuidv4(), c.user_id, c.post_id, c.content);
}
console.log(`✅ Created ${commentsData.length} comments`);

// --- CHALLENGES ---
const challengesData = [
  {
    id: uuidv4(),
    creator_id: alex.id,
    name: '30-Day Morning Run Club',
    description: 'Run every morning for 30 days. Any distance counts — a mile, a 5k, whatever. Just get out there.',
    frequency: 'daily',
    start_date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    end_date: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
  },
  {
    id: uuidv4(),
    creator_id: jess.id,
    name: 'Iron 60 — 60 Days of Strength',
    description: 'Lift weights or do bodyweight training every day for 60 days. Post your sessions.',
    frequency: 'daily',
    start_date: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    end_date: new Date(Date.now() + 55 * 86400000).toISOString().split('T')[0],
  },
  {
    id: uuidv4(),
    creator_id: priya.id,
    name: 'Mindful October',
    description: 'Daily meditation for the entire month. Even 5 minutes counts.',
    frequency: 'daily',
    start_date: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
    end_date: new Date(Date.now() + 29 * 86400000).toISOString().split('T')[0],
  },
];

for (const c of challengesData) {
  db.prepare(
    'INSERT INTO challenges (id, creator_id, name, description, frequency, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(c.id, c.creator_id, c.name, c.description, c.frequency, c.start_date, c.end_date);
}

// Challenge memberships
const challengeMemberships = [
  [challengesData[0].id, alex.id],
  [challengesData[0].id, jess.id],
  [challengesData[0].id, marco.id],
  [challengesData[1].id, jess.id],
  [challengesData[1].id, alex.id],
  [challengesData[1].id, jay.id],
  [challengesData[2].id, priya.id],
  [challengesData[2].id, jess.id],
  [challengesData[2].id, alex.id],
  [challengesData[2].id, jay.id],
];
for (const [cId, uId] of challengeMemberships) {
  db.prepare('INSERT OR IGNORE INTO challenge_members (challenge_id, user_id) VALUES (?, ?)').run(cId, uId);
}

// Link habits to challenges
const habitLinks = [
  [challengesData[0].id, alex.id, alexRun.id],
  [challengesData[0].id, jess.id, jessLift.id], // close enough
  [challengesData[2].id, priya.id, priyaYoga.id],
  [challengesData[2].id, jess.id, jessMed.id],
];
for (const [cId, uId, hId] of habitLinks) {
  db.prepare('INSERT OR IGNORE INTO challenge_habit_links (challenge_id, user_id, habit_id) VALUES (?, ?, ?)').run(cId, uId, hId);
}
console.log(`✅ Created ${challengesData.length} challenges`);

// --- NOTIFICATIONS ---
const notifs = [
  { user_id: alex.id, type: 'follow', from_user_id: jess.id, message: '' },
  { user_id: alex.id, type: 'like', from_user_id: priya.id, post_id: postsData[0].id, message: '' },
  { user_id: alex.id, type: 'comment', from_user_id: marco.id, post_id: postsData[0].id, message: '' },
  { user_id: jess.id, type: 'follow', from_user_id: alex.id, message: '' },
  { user_id: priya.id, type: 'badge', message: 'You earned the "Iron Will" badge! 💪' },
  { user_id: marco.id, type: 'badge', message: 'You earned the "Century" badge! 💯' },
];
for (const n of notifs) {
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, from_user_id, post_id, message) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), n.user_id, n.type, n.from_user_id || null, n.post_id || null, n.message);
}
console.log(`✅ Created notifications`);

console.log('\n🎉 Seed complete! Demo accounts:\n');
for (const u of users) {
  console.log(`  📧 ${u.email}  |  🔑 password123  |  @${u.username}`);
}
console.log('\n');
