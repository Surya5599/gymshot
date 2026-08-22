import React, { useEffect } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Squish } from './Squish';

type Props = { value: boolean; onChange: (v: boolean) => void };

const W = 52;
const H = 32;
const KNOB = 26;

export function Toggle({ value, onChange }: Props) {
  const t = useTheme();
  const p = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(value ? 1 : 0, t.motion.springSnappy);
  }, [value, p, t.motion.springSnappy]);

  const off = t.colors.surfaceSunken;
  const on = t.colors.mint;
  const track = useDerivedValue(() => interpolateColor(p.value, [0, 1], [off, on]));

  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: track.value }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: p.value * (W - KNOB - 6) }],
  }));

  return (
    <Squish scaleTo={0.92} haptic="light" onPress={() => onChange(!value)}>
      <Animated.View
        style={[
          trackStyle,
          {
            width: W,
            height: H,
            borderRadius: H / 2,
            padding: 3,
            justifyContent: 'center',
          },
        ]}
      >
        <Animated.View
          style={[
            knobStyle,
            {
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: '#FFFFFF',
            },
            t.shadow(1),
          ]}
        />
      </Animated.View>
    </Squish>
  );
}
