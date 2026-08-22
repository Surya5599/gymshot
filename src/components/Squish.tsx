import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform, Pressable, PressableProps, ViewStyle } from 'react-native';
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
 * The single interactive primitive. Everything tappable in Podshot squishes,
 * so touch feedback is consistent instead of per-screen improvisation.
 */
export function Squish({ style, scaleTo = 0.96, haptic = 'light', onPress, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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
      onPress={fire}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, motion.springSnappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.springBouncy);
      }}
    >
      <Animated.View style={[animated, style]}>{children}</Animated.View>
    </Pressable>
  );
}
