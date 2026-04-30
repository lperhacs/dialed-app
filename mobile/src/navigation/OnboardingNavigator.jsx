import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';

import OnboardingHook from '../screens/onboarding/OnboardingHook';
import OnboardingDeclaration from '../screens/onboarding/OnboardingDeclaration';
import OnboardingFindPeople from '../screens/onboarding/OnboardingFindPeople';
import OnboardingInvite from '../screens/onboarding/OnboardingInvite';
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome';

const Stack = createNativeStackNavigator();

export default function OnboardingNavigator({ onDone }) {
  const { colors } = useTheme();
  const screenOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.bg },
    animation: 'slide_from_right',
  };

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Hook">
        {props => <OnboardingHook {...props} onSkipToLogin={onDone} />}
      </Stack.Screen>
      <Stack.Screen name="Declaration" component={OnboardingDeclaration} />
      <Stack.Screen name="FindPeople" component={OnboardingFindPeople} />
      <Stack.Screen name="Invite" component={OnboardingInvite} />
      <Stack.Screen name="Welcome">
        {props => <OnboardingWelcome {...props} onDone={onDone} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
