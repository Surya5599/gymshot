import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

import { useTheme } from '@/theme';
import type { ColorName } from '@/theme/tokens';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'numeral';

export type TextProps = RNTextProps & {
  variant?: Variant;
  color?: ColorName;
  center?: boolean;
  /** Uppercase + tracked-out treatment for section labels. */
  eyebrow?: boolean;
};

export function Text({
  variant = 'body',
  color = 'ink',
  center,
  eyebrow,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const base = t.type[variant] as TextStyle;
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: t.colors[color] },
        center && { textAlign: 'center' },
        eyebrow && { textTransform: 'uppercase', letterSpacing: 1.1, fontSize: 11 },
        style,
      ]}
    />
  );
}
