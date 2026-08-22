import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0..1 - share of the current month's days that were logged. */
  progress: number;
  streak: number;
  size?: number;
  caption?: string;
};

/**
 * The hero object on the Today screen. The arc springs in on mount and
 * whenever progress changes, which is the app's one "reward" moment.
 */
export function StreakRing({ progress, streak, size = 208, caption = 'day streak' }: Props) {
  const t = useTheme();
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(120, withSpring(Math.max(0, Math.min(1, progress)), t.motion.springSoft));
  }, [progress, p, t.motion.springSoft]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="streak" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.colors.accent} />
            <Stop offset="1" stopColor={t.colors.sun} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.colors.surfaceSunken}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#streak)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="numeral">{streak}</Text>
      <Text variant="caption" color="inkSoft" eyebrow>
        {caption}
      </Text>
    </View>
  );
}
