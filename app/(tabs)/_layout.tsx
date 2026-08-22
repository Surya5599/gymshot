import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Squish, Text } from '@/components';
import { useTheme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'today', label: 'Today', icon: 'camera-outline', iconActive: 'camera' },
  { name: 'pods', label: 'Pods', icon: 'people-outline', iconActive: 'people' },
  { name: 'journey', label: 'Journey', icon: 'images-outline', iconActive: 'images' },
  { name: 'settings', label: 'You', icon: 'person-outline', iconActive: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <PodshotTabBar {...props} />} screenOptions={{ headerShown: false }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

/**
 * Floating glass tab bar. The active item lifts and its label fades in, so the
 * bar reads as one soft object rather than four separate buttons.
 */
function PodshotTabBar({ state, navigation }: any) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: t.space.xl,
        right: t.space.xl,
        bottom: insets.bottom + t.space.md,
      }}
    >
      <View style={[{ borderRadius: t.radius.pill, overflow: 'hidden' }, t.shadow(3)]}>
        <BlurView
          intensity={Platform.OS === 'android' ? 0 : 40}
          tint={t.scheme === 'dark' ? 'dark' : 'light'}
          style={{
            flexDirection: 'row',
            paddingVertical: 10,
            paddingHorizontal: t.space.sm,
            backgroundColor:
              Platform.OS === 'android'
                ? t.colors.bgElevated
                : t.scheme === 'dark'
                  ? 'rgba(27,24,23,0.72)'
                  : 'rgba(255,255,255,0.72)',
            borderWidth: 1,
            borderColor: t.colors.border,
            borderRadius: t.radius.pill,
          }}
        >
          {state.routes.map((route: any, index: number) => {
            const meta = TABS.find((x) => x.name === route.name) ?? TABS[index];
            return (
              <TabItem
                key={route.key}
                label={meta.label}
                icon={meta.icon}
                iconActive={meta.iconActive}
                focused={state.index === index}
                onPress={() => navigation.navigate(route.name)}
              />
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}

function TabItem({
  label,
  icon,
  iconActive,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  iconActive: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const lift = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, t.motion.springSnappy);
  }, [focused, lift, t.motion.springSnappy]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -3 * lift.value }, { scale: 1 + 0.08 * lift.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ translateY: 2 * (1 - lift.value) }],
  }));

  return (
    <Squish
      onPress={onPress}
      scaleTo={0.9}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={focused ? iconActive : icon}
          size={22}
          color={focused ? t.colors.accent : t.colors.inkFaint}
        />
      </Animated.View>
      <Animated.View style={labelStyle}>
        <Text variant="caption" color="accentInk" style={{ fontSize: 10, marginTop: 1 }}>
          {label}
        </Text>
      </Animated.View>
    </Squish>
  );
}
