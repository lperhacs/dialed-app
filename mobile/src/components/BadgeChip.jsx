import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../theme';
import { useTheme } from '../context/ThemeContext';

export const BADGE_INFO = {
  social_butterfly:   { label: 'Social Butterfly', desc: '50 followers' },
  day_3:              { label: 'Ignition',       desc: '3-day streak' },
  day_7:              { label: 'Week Warrior',   desc: '7-day streak' },
  day_14:             { label: 'Fortnight',      desc: '14-day streak' },
  day_30:             { label: 'Iron Will',      desc: '30-day streak' },
  day_60:             { label: 'Double Down',    desc: '60-day streak' },
  day_90:             { label: 'Relentless',     desc: '90-day streak' },
  day_180:            { label: 'Unstoppable',    desc: '180-day streak' },
  day_365:            { label: 'Full Circle',    desc: '365-day streak' },
  year_two_daily:     { label: 'The Long Game',  desc: '2-year daily streak' },
  year_three_daily:   { label: 'Ironclad',       desc: '3-year daily streak' },
  year_four_daily:    { label: 'Legendary',      desc: '4-year daily streak' },
  year_five_daily:    { label: 'Hall of Fame',   desc: '5-year daily streak' },
  week_1:             { label: 'First Step',     desc: '1-week streak' },
  week_4:             { label: 'Month Strong',   desc: '4-week streak' },
  week_8:             { label: 'Locked In',      desc: '8-week streak' },
  week_12:            { label: 'Quarter Grind',  desc: '12-week streak' },
  week_24:            { label: 'Halfway There',  desc: '24-week streak' },
  week_52:            { label: 'Year Round',     desc: '52-week streak' },
  week_78:            { label: 'No Days Off',    desc: '78-week streak' },
  week_104:           { label: 'Two Year Titan', desc: '104-week streak' },
  month_1:            { label: 'First Chapter',   desc: '1-month streak' },
  month_2:            { label: 'Building',         desc: '2-month streak' },
  month_3:            { label: 'Quarter Mark',     desc: '3-month streak' },
  month_6:            { label: 'Half Year Hero',   desc: '6-month streak' },
  month_12:           { label: 'Year One',          desc: '12-month streak' },
  month_24:           { label: 'Two Year Club',     desc: '24-month streak' },
  month_36:           { label: 'Three Year Grind',  desc: '36-month streak' },
  month_48:           { label: 'Four Year Legend',  desc: '48-month streak' },
  month_60:           { label: 'Five Year Icon',    desc: '60-month streak' },
};

export function getBadgeInfo(type) {
  return BADGE_INFO[type] || { label: type, desc: '' };
}

export default function BadgeChip({ badgeType, pinned, earned }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const info = getBadgeInfo(badgeType);
  return (
    <View style={[styles.chip, earned && styles.chipEarned, pinned && styles.chipPinned]}>
      <Text style={[styles.label, earned && styles.labelEarned]}>{info.label}</Text>
    </View>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
      backgroundColor: colors.bgHover,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipEarned: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentDim },
    chipPinned: { borderColor: colors.accent, borderWidth: 2 },
    label: { fontSize: 12, fontWeight: '600', color: colors.text, letterSpacing: 0.2 },
    labelEarned: { color: colors.accent },
  });
}
