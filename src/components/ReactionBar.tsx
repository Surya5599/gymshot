import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Squish } from './Squish';
import { Text } from './Text';

/** Reactions are deliberately a closed set - no free text leaves the pod. */
export const REACTIONS = ['\u{1F525}', '\u{1F44F}', '\u{1F4AA}', '\u{1F440}', '\u{1F60D}'] as const;
export type Reaction = (typeof REACTIONS)[number];

type Props = {
  counts: Partial<Record<Reaction, number>>;
  mine?: Reaction | null;
  onReact: (r: Reaction) => void;
};

function Pip({
  emoji,
  count,
  active,
  onPress,
}: {
  emoji: Reaction;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const pop = useSharedValue(1);
  const lift = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateY: lift.value }],
  }));

  return (
    <Squish
      haptic="light"
      scaleTo={0.9}
      onPress={() => {
        pop.value = withSequence(
          withTiming(1.35, { duration: 110 }),
          withSpring(1, t.motion.springBouncy)
        );
        lift.value = withSequence(withTiming(-6, { duration: 110 }), withSpring(0, t.motion.springBouncy));
        onPress();
      }}
    >
      <Animated.View
        style={[
          style,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 11,
            paddingVertical: 7,
            borderRadius: t.radius.pill,
            backgroundColor: active ? t.colors.accentSoft : t.colors.surfaceAlt,
            borderWidth: 1,
            borderColor: active ? t.colors.accent : 'transparent',
          },
        ]}
      >
        <Text style={{ fontSize: 15, lineHeight: 19 }}>{emoji}</Text>
        {count > 0 ? (
          <Text variant="caption" color={active ? 'accentInk' : 'inkSoft'}>
            {count}
          </Text>
        ) : null}
      </Animated.View>
    </Squish>
  );
}

export function ReactionBar({ counts, mine, onReact }: Props) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? REACTIONS : REACTIONS.filter((r) => (counts[r] ?? 0) > 0 || r === mine);
  const shown = visible.length ? visible : [REACTIONS[0], REACTIONS[2]];

  return (
    <View style={{ flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
      {shown.map((r) => (
        <Pip
          key={r}
          emoji={r}
          count={counts[r] ?? 0}
          active={mine === r}
          onPress={() => onReact(r)}
        />
      ))}
      {!expanded && shown.length < REACTIONS.length ? (
        <Squish scaleTo={0.9} onPress={() => setExpanded(true)}>
          <View
            style={{
              paddingHorizontal: 11,
              paddingVertical: 7,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.surfaceAlt,
            }}
          >
            <Text variant="caption" color="inkSoft">
              +
            </Text>
          </View>
        </Squish>
      ) : null}
    </View>
  );
}
