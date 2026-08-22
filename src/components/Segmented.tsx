import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Squish } from './Squish';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
};

/** Sliding-pill segmented control. The pill travels; labels only cross-fade. */
export function Segmented<T extends string>({ options, value, onChange }: Props<T>) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const cell = width / Math.max(1, options.length);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - 8;
    setWidth(w);
    x.value = (w / Math.max(1, options.length)) * index;
  };

  React.useEffect(() => {
    if (width > 0) x.value = withSpring(cell * index, t.motion.springSnappy);
  }, [index, cell, width, x, t.motion.springSnappy]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surfaceSunken,
        borderRadius: t.radius.pill,
        padding: 4,
      }}
    >
      {width > 0 && (
        <Animated.View
          style={[
            pill,
            {
              position: 'absolute',
              left: 4,
              top: 4,
              bottom: 4,
              width: cell,
              backgroundColor: t.colors.surface,
              borderRadius: t.radius.pill,
            },
            t.shadow(1),
          ]}
        />
      )}
      {options.map((o) => (
        <Squish
          key={o.value}
          scaleTo={0.94}
          onPress={() => onChange(o.value)}
          style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}
        >
          <Text
            variant="label"
            color={o.value === value ? 'ink' : 'inkFaint'}
            style={{ opacity: o.value === value ? 1 : 0.8 }}
          >
            {o.label}
          </Text>
        </Squish>
      ))}
    </View>
  );
}
