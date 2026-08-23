import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  /** Extra bottom padding so content clears the floating tab bar. */
  tabBarPad?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

/**
 * Vertical room the floating tab bar assembly occupies above the safe area:
 * the pill itself, its clearance from the system nav bar, and the fade above
 * it. Mirrors the geometry in `app/(tabs)/_layout.tsx`.
 */
export const TAB_BAR_HEIGHT = 126;

export function Screen({ children, scroll = true, tabBarPad = false, style, contentStyle }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {
    paddingTop: insets.top + t.space.md,
    paddingBottom: insets.bottom + (tabBarPad ? TAB_BAR_HEIGHT + t.space.xxl : t.space.xxl),
    paddingHorizontal: t.space.xl,
  };

  if (!scroll) {
    return <View style={[styles.fill, { backgroundColor: t.colors.bg }, pad, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: t.colors.bg }, style]}
      contentContainerStyle={[pad, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
