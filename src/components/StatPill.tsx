import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint?: 'mint' | 'lilac' | 'sun' | 'accent';
};

/** Compact read-only metric. Never tappable - these values are pulled, not set. */
export function StatPill({ icon, value, label, tint = 'mint' }: Props) {
  const t = useTheme();
  const soft = { mint: t.colors.mintSoft, lilac: t.colors.lilacSoft, sun: t.colors.sunSoft, accent: t.colors.accentSoft }[tint];
  const strong = { mint: t.colors.mint, lilac: t.colors.lilac, sun: t.colors.sun, accent: t.colors.accent }[tint];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: soft,
        borderRadius: t.radius.lg,
        padding: t.space.md,
        gap: 2,
      }}
    >
      <Ionicons name={icon} size={15} color={strong} />
      <Text variant="heading" style={{ marginTop: 2 }}>
        {value}
      </Text>
      <Text variant="caption" color="inkSoft">
        {label}
      </Text>
    </View>
  );
}
