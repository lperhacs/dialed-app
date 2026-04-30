import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme';

const TERMS_TEXT = `Terms of Service
Last updated: April 29, 2026

1. ELIGIBILITY
You must be at least 13 years old to use the App.

2. YOUR ACCOUNT
You are responsible for your account and all activity under it. You must provide accurate information when registering.

3. ACCEPTABLE USE
You agree not to post illegal, abusive, threatening, or harassing content; impersonate others; spam users; attempt unauthorized access to the App; or use the App for commercial purposes without consent.

4. YOUR CONTENT
You retain ownership of content you post. By posting, you grant Dialed a license to display it within the App. You are responsible for what you post.

5. DIALED PRO SUBSCRIPTION
Dialed Pro is an optional paid subscription ($3.99/month or $29.99/year) billed through the Apple App Store. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel in your App Store account settings. No refunds for partial periods except where required by law.

6. PRIVACY & DATA
By using the App, you acknowledge that we collect usage analytics and may share anonymized, aggregate data with partners. We do not sell your personal information. See our Privacy Policy for details.

7. TERMINATION
We may suspend or terminate your account for violations of these Terms at any time. You may delete your account at any time in Settings.

8. DISCLAIMERS
The App is provided "as is" without warranties of any kind. Use is at your own risk.

9. LIMITATION OF LIABILITY
Dialed is not liable for indirect, incidental, or consequential damages arising from your use of the App.

10. GOVERNING LAW
These Terms are governed by the laws of the State of Texas.

Questions? Email support@dialed.app`;

const PRIVACY_TEXT = `Privacy Policy
Last updated: April 29, 2026

1. WHAT WE COLLECT
- Account info: name, email, username, password
- Profile info: photo, bio, location (optional)
- Content: habits, posts, comments, messages
- Usage analytics: features used, habits logged, screens visited, session activity
- Device info: device type, OS version, app version

2. HOW WE USE IT
- To run and improve the App
- To display your profile and content to other users
- To send notifications about your account
- To analyze usage patterns and develop new features
- To respond to support requests

3. HOW WE SHARE IT
- Public content is visible to other Dialed users (controlled by your privacy settings)
- We may share anonymized, aggregate analytics data with partners — this data cannot identify you individually
- We do not sell your personal information (name, email, messages, private content)
- We use Railway for secure server hosting
- We may share data if required by law

4. YOUR RIGHTS
You can access, correct, or delete your data at any time. To delete your account, go to Settings → Delete account. Deleted accounts are permanently removed within 30 days.

5. CHILDREN
The App is not intended for users under 13. We do not knowingly collect data from children under 13.

6. CHANGES
We will notify you of significant changes to this policy through the App or by email.

Questions? Email support@dialed.app`;

export default function LegalScreen({ route }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const doc = route?.params?.doc;
  const text = doc === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.body, { color: colors.textMuted }]}>{text}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  body: { fontSize: 14, lineHeight: 22 },
});
