import React, { useState, useRef } from 'react';
import {
  TouchableOpacity, View, Text, StyleSheet,
  Animated, Pressable, Modal, useWindowDimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '../screens/HomeScreen';
import HabitsScreen from '../screens/HabitsScreen';
import WeeklyRecapScreen from '../screens/WeeklyRecapScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import InboxScreen from '../screens/InboxScreen';
import SearchScreen from '../screens/SearchScreen';

import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();

function HomeStackNavigator() {
  const { colors } = useTheme();
  const stackHeader = {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700', fontSize: 17 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bg },
  };
  return (
    <HomeStack.Navigator screenOptions={stackHeader}>
      <HomeStack.Screen name="Feed" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications', headerBackTitle: 'Home' }} />
      <HomeStack.Screen name="Inbox" component={InboxScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="WeeklyRecap" component={WeeklyRecapScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
    </HomeStack.Navigator>
  );
}

function TabIcon({ name, focused }) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={focused ? name : `${name}-outline`}
      size={22}
      color={focused ? colors.accent : colors.textMuted}
    />
  );
}

function CreateTabButton() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  // Fan items: angle in degrees from the positive x-axis, radius from button center
  const FAN_ITEMS = [
    { type: 'post',  label: 'Post',  icon: '✏️', color: colors.accent, angle: 130, radius: 100 },
    { type: 'event', label: 'Event', icon: '📅', color: '#5B6EF5',     angle: 50,  radius: 100 },
  ];

  const rotateAnim   = useRef(new Animated.Value(0)).current; // kept for potential future use
  const backdropAnim = useRef(new Animated.Value(0)).current;
  // One animated value per fan item: 0 = collapsed at button, 1 = fanned out
  const fanAnims = useRef(FAN_ITEMS.map(() => new Animated.Value(0))).current;

  const TAB_HEIGHT = 80;
  // Vertical center of the + button from the bottom of the screen
  const BTN_BOTTOM = insets.bottom + 16 + 26; // paddingBottom + half button height

  const toggle = (toOpen) => {
    const toValue = toOpen ? 1 : 0;
    Animated.parallel([
Animated.timing(backdropAnim, { toValue, duration: toOpen ? 200 : 160, useNativeDriver: true }),
      ...fanAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue,
          tension: 70,
          friction: 9,
          delay: toOpen ? i * 40 : 0,
          useNativeDriver: true,
        })
      ),
    ]).start();
    setOpen(toOpen);
  };

  const handleSelect = (type) => {
    toggle(false);
    setTimeout(() => {
      if (type === 'post')  navigation.navigate('CreatePost');
      if (type === 'event') navigation.navigate('CreateEvent');
    }, 180);
  };

  const styles = makeStyles(colors);

  return (
    <>
      {/* Backdrop + fan items rendered in a Modal so they float above the tab bar */}
      <Modal transparent visible={open} animationType="none" onRequestClose={() => toggle(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]} />
        </Pressable>

        {FAN_ITEMS.map((item, i) => {
          const rad = (item.angle * Math.PI) / 180;
          const targetX = Math.cos(rad) * item.radius;
          const targetY = -Math.sin(rad) * item.radius; // negative = upward

          const translateX = fanAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, targetX] });
          const translateY = fanAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0, targetY] });
          const scale      = fanAnims[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
          const opacity    = fanAnims[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.8, 1] });

          return (
            <Animated.View
              key={item.type}
              style={[
                styles.fanItemWrapper,
                {
                  bottom: BTN_BOTTOM,
                  left: width / 2 - 28,  // center on the + button (28 = half item width)
                  opacity,
                  transform: [{ translateX }, { translateY }, { scale }],
                },
              ]}
              pointerEvents="box-none"
            >
              <TouchableOpacity
                style={styles.fanItem}
                onPress={() => handleSelect(item.type)}
                activeOpacity={0.85}
              >
                <View style={[styles.fanCircle, { backgroundColor: item.color }]}>
                  <Text style={styles.fanIcon}>{item.icon}</Text>
                </View>
                <Text style={styles.fanLabel}>{item.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </Modal>

      {/* The actual + button in the tab bar */}
      <View style={styles.createBtnContainer}>
        <TouchableOpacity onPress={() => toggle(!open)} activeOpacity={0.85} style={styles.createBtn}>
          <Ionicons name="add" size={28} color="#0c0c0e" />
        </TouchableOpacity>
      </View>
    </>
  );
}

function MyProfileScreen() {
  const { user } = useAuth();
  return <ProfileScreen routeUsername={user?.username} isOwn />;
}

export default function TabNavigator() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} options={{ tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }} />
      <Tab.Screen name="Habits" component={HabitsScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="radio-button-on" focused={focused} /> }} />
      <Tab.Screen
        name="CreateDummy"
        component={HomeScreen}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => null,
          tabBarButton: () => <CreateTabButton />,
        }}
      />
      <Tab.Screen name="Clubs" component={ChallengesScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} /> }} />
      <Tab.Screen
        name="ProfileTab"
        component={MyProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    tabBar: {
      backgroundColor: colors.bg,
      borderTopColor: colors.borderSubtle,
      borderTopWidth: 1,
      height: 80,
      paddingBottom: 16,
      paddingTop: 8,
    },
    tabLabel: { fontSize: 10, fontWeight: '500', marginTop: 2 },
    tabItem: { paddingTop: 2 },
    createBtnContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 10,
    },
    createBtn: {
      width: 46, height: 46, borderRadius: 23,
      backgroundColor: colors.accent,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
    },

    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    fanItemWrapper: { position: 'absolute', alignItems: 'center' },
    fanItem: { alignItems: 'center', gap: 6 },
    fanCircle: {
      width: 52, height: 52, borderRadius: 26,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
    },
    fanIcon: { fontSize: 22 },
    fanLabel: { fontSize: 11, fontWeight: '600', color: '#fff' },
  });
}
