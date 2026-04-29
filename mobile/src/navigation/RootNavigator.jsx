import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import OnboardingNavigator from './OnboardingNavigator';

import TabNavigator from './TabNavigator';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import LocationPickerScreen from '../screens/LocationPickerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChallengeDetailScreen from '../screens/ChallengeDetailScreen';
import CommentsScreen from '../screens/CommentsScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import ConversationScreen from '../screens/ConversationScreen';
import SettingsScreen from '../screens/SettingsScreen';
import FollowListScreen from '../screens/FollowListScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const [onboardingDone, setOnboardingDone] = useState(null); // null = still checking

  useEffect(() => {
    AsyncStorage.getItem('dialed_onboarding_done').then(val => {
      setOnboardingDone(!!val);
    });
  }, []);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem('dialed_onboarding_done', 'true');
    setOnboardingDone(true);
  }, []);

  const headerOptions = {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700', fontSize: 17 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
  };

  if (loading || onboardingDone === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  // Show onboarding once, regardless of auth state
  if (!onboardingDone) {
    return <OnboardingNavigator onDone={finishOnboarding} />;
  }

  return (
    <Stack.Navigator screenOptions={headerOptions}>
      {!user ? (
        // ─── Auth screens ────────────────────────────────────────────────
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          <Stack.Screen name="VerifyEmail" component={EmailVerificationScreen} options={{ headerShown: false }} />
        </>
      ) : (
        // ─── Authenticated app ───────────────────────────────────────────
        <>
          <Stack.Screen name="MainTabs" component={TabNavigator} options={{ headerShown: false }} />

          {/* Global screens - accessible from any tab */}
          <Stack.Screen
            name="UserProfile"
            component={ProfileScreen}
            options={{ title: '', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="ClubDetail"
            component={ChallengeDetailScreen}
            options={{ title: '', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="Leaderboard"
            component={LeaderboardScreen}
            options={{ title: 'Leaderboard' }}
          />
          <Stack.Screen
            name="Comments"
            component={CommentsScreen}
            options={{ title: 'Comments' }}
          />

          <Stack.Screen
            name="Conversation"
            component={ConversationScreen}
            options={{ title: '', headerBackTitle: 'Messages' }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings', headerBackTitle: 'Profile' }}
          />
          <Stack.Screen
            name="FollowList"
            component={FollowListScreen}
            options={({ route }) => ({
              title: route.params?.type === 'followers' ? 'Followers' : 'Following',
              headerBackTitle: 'Back',
            })}
          />

          {/* Modal screens */}
          <Stack.Screen
            name="CreatePost"
            component={CreatePostScreen}
            options={{
              presentation: 'modal',
              title: 'New Post',
              headerStyle: { backgroundColor: colors.bgCard },
            }}
          />
          <Stack.Screen
            name="CreateEvent"
            component={CreateEventScreen}
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="LocationPicker"
            component={LocationPickerScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
