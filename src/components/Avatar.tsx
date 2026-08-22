import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';

import { hueFor, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  id: string;
  name: string;
  size?: number;
  /** Ring states communicate today's check-in status at a glance. */
  ring?: 'none' | 'done' | 'missed';
};

export function Avatar({ id, name, size = 44, ring = 'none' }: Props) {
  const t = useTheme();
  const [from, to] = hueFor(id);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const ringColor = ring === 'done' ? t.colors.mint : ring === 'missed' ? t.colors.inkFaint : 'transparent';
  const ringWidth = ring === 'none' ? 0 : 2.5;
  const gap = ring === 'none' ? 0 : 3;
  const outer = size + (ringWidth + gap) * 2;

  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        borderWidth: ringWidth,
        borderColor: ringColor,
        alignItems: 'center',
        justifyContent: 'center',
        borderStyle: ring === 'missed' ? 'dashed' : 'solid',
      }}
    >
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          variant="label"
          style={{ color: '#FFFFFF', fontSize: size * 0.36, lineHeight: size * 0.42 }}
        >
          {initials || '?'}
        </Text>
      </LinearGradient>
    </View>
  );
}
