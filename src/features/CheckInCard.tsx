import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Card, PhotoTile, ReactionBar, Segmented, Text, type Reaction } from '@/components';
import { REACTIONS } from '@/components/ReactionBar';
import type { FeedItem, Settings } from '@/db/types';
import { ANGLES, type Angle } from '@/db/types';
import { relativeTime } from '@/lib/date';
import { useTheme } from '@/theme';

type Props = {
  item: FeedItem;
  meId: string;
  index: number;
  settings: Settings;
  onReact: (checkinId: string, emoji: string) => void;
};

/**
 * One person's day. Photo first, effort context second, numbers last and only
 * when that person chose to share them.
 */
export function CheckInCard({ item, meId, index, settings, onReact }: Props) {
  const t = useTheme();
  const available = ANGLES.filter((a) => item.photos.some((p) => p.angle === a));
  const [angle, setAngle] = useState<Angle>(available[0] ?? 'front');
  const photo = item.photos.find((p) => p.angle === angle) ?? item.photos[0];

  const counts: Partial<Record<Reaction, number>> = {};
  let mine: Reaction | null = null;
  for (const r of item.reactions) {
    const emoji = r.emoji as Reaction;
    if (!REACTIONS.includes(emoji)) continue;
    counts[emoji] = (counts[emoji] ?? 0) + 1;
    if (r.user_id === meId) mine = emoji;
  }

  const isMe = item.user.is_me === 1;
  // Metric visibility is a global per-user choice, so for my own card it comes
  // from settings; a pod-mate's row already arrives filtered by their choice.
  const showWeight = isMe ? settings.share_weight === 1 : item.metrics?.weight_kg != null;
  const showCalories = isMe ? settings.share_calories === 1 : item.metrics?.calories_in != null;

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).duration(380)}>
      <Card padded="lg" radiusKey="xxl" level={1} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <Avatar id={item.user.id} name={item.user.display_name} size={38} ring="done" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{isMe ? 'You' : item.user.display_name}</Text>
            <Text variant="caption" color="inkFaint">
              {relativeTime(item.checkin.created_at)}
              {item.checkin.trained === 1 ? '  ·  trained' : ''}
            </Text>
          </View>
          {item.checkin.trained === 1 ? (
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: t.colors.mintSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="barbell-outline" size={15} color={t.colors.mint} />
            </View>
          ) : null}
        </View>

        <PhotoTile
          uri={photo?.uri}
          seed={`${item.user.id}-${angle}`}
          blur={isMe && settings.blur_face === 1}
          radiusKey="lg"
          style={{ aspectRatio: 0.78, marginTop: t.space.lg }}
          label={available.length > 1 ? undefined : angle}
        />

        {available.length > 1 ? (
          <View style={{ marginTop: t.space.md }}>
            <Segmented
              options={available.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
              value={angle}
              onChange={setAngle}
            />
          </View>
        ) : null}

        {item.checkin.note ? (
          <Text color="inkSoft" style={{ marginTop: t.space.md }}>
            {item.checkin.note}
          </Text>
        ) : null}

        {(showWeight || showCalories) && item.metrics ? (
          <View style={{ flexDirection: 'row', gap: t.space.md, marginTop: t.space.md }}>
            {showWeight && item.metrics.weight_kg != null ? (
              <Metric icon="scale-outline" text={`${item.metrics.weight_kg} kg`} />
            ) : null}
            {showCalories && item.metrics.calories_in != null ? (
              <Metric icon="flame-outline" text={`${Math.round(item.metrics.calories_in)} kcal`} />
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: t.space.lg }}>
          <ReactionBar
            counts={counts}
            mine={mine}
            onReact={(emoji) => onReact(item.checkin.id, emoji)}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

function Metric({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surfaceAlt,
      }}
    >
      <Ionicons name={icon} size={13} color={t.colors.inkSoft} />
      <Text variant="caption" color="inkSoft">
        {text}
      </Text>
    </View>
  );
}
