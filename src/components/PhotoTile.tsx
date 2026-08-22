import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View, ViewStyle } from 'react-native';

import { hueFor, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  uri?: string | null;
  /** Used to generate a stable placeholder when there is no image. */
  seed: string;
  blur?: boolean;
  radiusKey?: 'md' | 'lg' | 'xl';
  style?: ViewStyle;
  label?: string;
};

/**
 * Renders a check-in photo. When there is no file (a pod-mate on a device we
 * do not sync binaries with yet, or a placeholder), it falls back to a stable
 * gradient silhouette rather than a broken-image box.
 */
export function PhotoTile({ uri, seed, blur, radiusKey = 'lg', style, label }: Props) {
  const t = useTheme();
  const [from, to] = hueFor(seed);

  return (
    <View
      style={[
        {
          overflow: 'hidden',
          borderRadius: t.radius[radiusKey],
          backgroundColor: t.colors.surfaceSunken,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={220}
          blurRadius={blur ? 28 : 0}
        />
      ) : (
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: '38%',
              height: '58%',
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.28)',
            }}
          />
        </LinearGradient>
      )}
      {label ? (
        <View
          style={{
            position: 'absolute',
            left: t.space.sm,
            bottom: t.space.sm,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: t.radius.pill,
            backgroundColor: 'rgba(0,0,0,0.42)',
          }}
        >
          <Text variant="caption" style={{ color: '#FFFFFF' }}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
