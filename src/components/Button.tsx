import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { Squish } from './Squish';
import { Text } from './Text';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  loading,
  disabled,
  style,
}: Props) {
  const t = useTheme();
  const spec = {
    primary: { bg: t.colors.ink, fg: t.colors.inkInverse, border: 'transparent' },
    secondary: { bg: t.colors.surface, fg: t.colors.ink, border: t.colors.borderStrong },
    ghost: { bg: 'transparent', fg: t.colors.inkSoft, border: 'transparent' },
    danger: { bg: t.colors.accentSoft, fg: t.colors.accentInk, border: 'transparent' },
  }[variant];

  const inert = disabled || loading;

  return (
    <Squish
      onPress={inert ? undefined : onPress}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      scaleTo={0.97}
      style={{
        backgroundColor: spec.bg,
        borderColor: spec.border,
        borderWidth: spec.border === 'transparent' ? 0 : 1,
        borderRadius: t.radius.pill,
        paddingVertical: size === 'lg' ? 18 : 14,
        paddingHorizontal: t.space.xxl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.sm,
        opacity: inert ? 0.45 : 1,
        ...style,
      }}
    >
      {loading ? (
        <ActivityIndicator color={spec.fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'lg' ? 20 : 17} color={spec.fg} /> : null}
          <Text variant={size === 'lg' ? 'heading' : 'bodyStrong'} style={{ color: spec.fg }}>
            {label}
          </Text>
        </>
      )}
    </Squish>
  );
}
