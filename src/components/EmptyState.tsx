import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon, title, body, actionLabel, onAction }: Props) {
  const t = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      style={{ alignItems: 'center', paddingVertical: t.space.huge, gap: t.space.md }}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          backgroundColor: t.colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={30} color={t.colors.inkFaint} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      <Text color="inkSoft" center style={{ maxWidth: 280 }}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: t.space.sm }} />
      ) : null}
    </Animated.View>
  );
}
