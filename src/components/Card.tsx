import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

type Props = ViewProps & {
  padded?: boolean | keyof ReturnType<typeof useTheme>['space'];
  level?: 0 | 1 | 2 | 3;
  radiusKey?: 'md' | 'lg' | 'xl' | 'xxl';
  tint?: 'surface' | 'surfaceAlt' | 'accentSoft' | 'mintSoft' | 'lilacSoft' | 'sunSoft';
  bordered?: boolean;
};

export function Card({
  padded = true,
  level = 1,
  radiusKey = 'xl',
  tint = 'surface',
  bordered = true,
  style,
  ...rest
}: Props) {
  const t = useTheme();
  const pad = padded === true ? t.space.xl : padded === false ? 0 : t.space[padded];
  const base: ViewStyle = {
    backgroundColor: t.colors[tint],
    borderRadius: t.radius[radiusKey],
    padding: pad,
    borderWidth: bordered ? 1 : 0,
    borderColor: t.colors.border,
  };
  return <View {...rest} style={[base, level > 0 && t.shadow(level as 1 | 2 | 3), style]} />;
}
