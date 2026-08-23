import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform, Pressable, PressableProps, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { motion } from '@/theme';

type Props = Omit<PressableProps, 'style'> & {
  style?: ViewStyle | ViewStyle[];
  /** How far it compresses. 0.96 for cards, 0.92 for small chips. */
  scaleTo?: number;
  haptic?: false | 'light' | 'medium' | 'success';
  children?: React.ReactNode;
};

/**
 * Style properties that describe how the element sits in its parent. These have
 * to end up on the Pressable: left on the inner view they are measured against a
 * box that has already shrink-wrapped to its content, so `flex: 1` silently does
 * nothing and the row bunches up. Everything else - padding, background, border,
 * alignment - stays inside, so the squish scales the whole visible box.
 */
const LAYOUT_KEYS = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'zIndex',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
]);

function splitStyle(style?: ViewStyle | ViewStyle[]) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    (LAYOUT_KEYS.has(key) ? outer : inner)[key] = value;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

/**
 * The single interactive primitive. Everything tappable in GymShot squishes,
 * so touch feedback is consistent instead of per-screen improvisation.
 */
export function Squish({ style, scaleTo = 0.96, haptic = 'light', onPress, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const { outer, inner } = splitStyle(style);

  const fire = useCallback(
    (e: any) => {
      if (haptic && Platform.OS !== 'web') {
        if (haptic === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        else
          Haptics.impactAsync(
            haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
          );
      }
      onPress?.(e);
    },
    [haptic, onPress]
  );

  return (
    <Pressable
      {...rest}
      style={outer}
      onPress={fire}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, motion.springSnappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.springBouncy);
      }}
    >
      <Animated.View style={[animated, inner]}>{children}</Animated.View>
    </Pressable>
  );
}
