import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Avatar, PhotoTile, Squish, Text } from '@/components';
import { REACTIONS, type Reaction } from '@/components/ReactionBar';
import type { FeedItem, Photo, Settings, User } from '@/db/types';
import { ANGLES, type Angle } from '@/db/types';
import { formatDay, relativeTime } from '@/lib/date';
import { useTheme } from '@/theme';

/**
 * The pod as a chat thread.
 *
 * The metaphor does real work here: a photo arrives as a message from a
 * person, so three pod-mates posting reads as three people rather than a
 * grid of tiles. And because the composer is where a keyboard would be, the
 * one-photo-a-day rule is stated exactly where you would try to break it.
 */

const BUBBLE_R = 22;
const TIGHT_R = 7;

type Props = {
  items: FeedItem[];
  /** Everyone in the pod(s), so we can name who has not posted. */
  members: User[];
  meId: string;
  settings: Settings;
  day: string;
  onReact: (checkinId: string, emoji: string) => void;
  /** Opens capture for a specific angle. */
  onCapture: (angle: Angle) => void;
  myAngles: Angle[];
};

export function PodThread({
  items,
  members,
  meId,
  settings,
  day,
  onReact,
  onCapture,
  myAngles,
}: Props) {
  const t = useTheme();

  // Oldest first: a thread reads downward.
  const ordered = useMemo(
    () => [...items].sort((a, b) => a.checkin.created_at.localeCompare(b.checkin.created_at)),
    [items]
  );

  const postedIds = new Set(ordered.map((i) => i.user.id));
  const waiting = members.filter((m) => !postedIds.has(m.id) && m.id !== meId);
  const iPosted = postedIds.has(meId);

  return (
    <View>
      <DayDivider day={day} />

      {ordered.length === 0 ? (
        <Animated.View entering={FadeIn.duration(320)} style={{ paddingVertical: t.space.xxxl }}>
          <Text variant="caption" color="inkFaint" center>
            Nothing today yet. Whoever posts first breaks the ice.
          </Text>
        </Animated.View>
      ) : (
        ordered.map((item, i) => (
          <MessageGroup
            key={item.checkin.id}
            item={item}
            index={i}
            isMe={item.user.id === meId}
            meId={meId}
            settings={settings}
            onReact={onReact}
          />
        ))
      )}

      {waiting.length ? <WaitingRow people={waiting} /> : null}

      <Composer iPosted={iPosted} myAngles={myAngles} onCapture={onCapture} />
    </View>
  );
}

/* ------------------------------------------------------------------ pieces */

/** iMessage-style centred date chip. */
function DayDivider({ day }: { day: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: t.space.lg }}>
      <View
        style={{
          paddingHorizontal: t.space.md,
          paddingVertical: 5,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.surfaceAlt,
        }}
      >
        <Text variant="caption" color="inkSoft" style={{ fontSize: 11 }}>
          {formatDay(day)}
        </Text>
      </View>
    </View>
  );
}

function MessageGroup({
  item,
  index,
  isMe,
  meId,
  settings,
  onReact,
}: {
  item: FeedItem;
  index: number;
  isMe: boolean;
  meId: string;
  settings: Settings;
  onReact: (checkinId: string, emoji: string) => void;
}) {
  const t = useTheme();
  const [picking, setPicking] = useState(false);

  // Multiple angles from one person are consecutive attachments in one group,
  // the way a photo burst appears in a chat.
  const photos = useMemo(() => {
    const out: Photo[] = [];
    for (const angle of ANGLES as Angle[]) {
      const found = item.photos.find((p) => p.angle === angle);
      if (found) out.push(found);
    }
    return out.length ? out : item.photos;
  }, [item.photos]);

  const counts: Partial<Record<Reaction, number>> = {};
  let mine: Reaction | null = null;
  for (const r of item.reactions) {
    const emoji = r.emoji as Reaction;
    if (!REACTIONS.includes(emoji)) continue;
    counts[emoji] = (counts[emoji] ?? 0) + 1;
    if (r.user_id === meId) mine = emoji;
  }
  const hasTapbacks = Object.keys(counts).length > 0;

  const showMetrics = isMe
    ? settings.share_weight === 1 || settings.share_calories === 1
    : item.metrics != null;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 90).duration(380)}
      style={{ marginBottom: t.space.xl, alignItems: isMe ? 'flex-end' : 'flex-start' }}
    >
      {!isMe ? (
        <Text variant="caption" color="inkFaint" style={{ marginLeft: 46, marginBottom: 4, fontSize: 11 }}>
          {item.user.display_name}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.space.sm, maxWidth: '86%' }}>
        {!isMe ? (
          <Avatar id={item.user.id} name={item.user.display_name} size={30} />
        ) : null}

        <View style={{ alignItems: isMe ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
          {photos.map((photo, pi) => {
            const last = pi === photos.length - 1;
            return (
              <View key={photo.id} style={{ marginBottom: last ? 0 : 3 }}>
                <Squish
                  scaleTo={0.97}
                  haptic="light"
                  onPress={() => !isMe && setPicking((v) => !v)}
                >
                  <PhotoTile
                    uri={photo.uri}
                    seed={`${item.user.id}-${photo.angle}`}
                    blur={isMe && settings.blur_face === 1}
                    style={{
                      width: 208,
                      aspectRatio: 0.76,
                      borderRadius: BUBBLE_R,
                      borderBottomRightRadius: isMe && last ? TIGHT_R : BUBBLE_R,
                      borderBottomLeftRadius: !isMe && last ? TIGHT_R : BUBBLE_R,
                    }}
                    label={photos.length > 1 ? photo.angle : undefined}
                  />
                </Squish>

                {/* Tapbacks overlap the bubble corner, as in iMessage. */}
                {last && hasTapbacks ? (
                  <Animated.View
                    entering={ZoomIn.springify().damping(13)}
                    style={{
                      position: 'absolute',
                      top: -12,
                      [isMe ? 'left' : 'right']: -6,
                      flexDirection: 'row',
                      gap: 2,
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                      borderRadius: t.radius.pill,
                      backgroundColor: t.colors.bgElevated,
                      borderWidth: 1,
                      borderColor: t.colors.border,
                      ...t.shadow(1),
                    }}
                  >
                    {(Object.keys(counts) as Reaction[]).map((emoji) => (
                      <Text key={emoji} style={{ fontSize: 12 }}>
                        {emoji}
                        {(counts[emoji] ?? 0) > 1 ? (
                          <Text variant="caption" color="inkSoft" style={{ fontSize: 10 }}>
                            {' '}
                            {counts[emoji]}
                          </Text>
                        ) : null}
                      </Text>
                    ))}
                  </Animated.View>
                ) : null}

                {last && picking ? (
                  <TapbackPicker
                    mine={mine}
                    align={isMe ? 'right' : 'left'}
                    onPick={(emoji) => {
                      onReact(item.checkin.id, emoji);
                      setPicking(false);
                    }}
                  />
                ) : null}
              </View>
            );
          })}

          {/* The note is its own bubble - a caption sent after the photo. */}
          {item.checkin.note ? (
            <View
              style={{
                marginTop: 3,
                maxWidth: 240,
                paddingHorizontal: t.space.md,
                paddingVertical: 9,
                borderRadius: BUBBLE_R,
                borderBottomRightRadius: isMe ? TIGHT_R : BUBBLE_R,
                borderBottomLeftRadius: isMe ? BUBBLE_R : TIGHT_R,
                backgroundColor: isMe ? t.colors.accent : t.colors.surfaceAlt,
              }}
            >
              <Text style={{ color: isMe ? '#FFFFFF' : t.colors.ink, fontSize: 15 }}>
                {item.checkin.note}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 5,
              paddingHorizontal: 2,
            }}
          >
            <Text variant="caption" color="inkFaint" style={{ fontSize: 10 }}>
              {relativeTime(item.checkin.created_at)}
            </Text>
            {item.checkin.trained === 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Ionicons name="barbell" size={10} color={t.colors.mint} />
                <Text variant="caption" color="mint" style={{ fontSize: 10 }}>
                  trained
                </Text>
              </View>
            ) : null}
            {showMetrics && item.metrics ? (
              <>
                {(isMe ? settings.share_weight === 1 : true) && item.metrics.weight_kg != null ? (
                  <Text variant="caption" color="inkFaint" style={{ fontSize: 10 }}>
                    {item.metrics.weight_kg} kg
                  </Text>
                ) : null}
                {(isMe ? settings.share_calories === 1 : true) && item.metrics.calories_in != null ? (
                  <Text variant="caption" color="inkFaint" style={{ fontSize: 10 }}>
                    {Math.round(item.metrics.calories_in)} kcal
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/** Floating emoji row, the iMessage tapback gesture. */
function TapbackPicker({
  mine,
  align,
  onPick,
}: {
  mine: Reaction | null;
  align: 'left' | 'right';
  onPick: (emoji: Reaction) => void;
}) {
  const t = useTheme();
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(14)}
      exiting={FadeOut.duration(120)}
      style={{
        position: 'absolute',
        top: -52,
        [align === 'right' ? 'right' : 'left']: 0,
        flexDirection: 'row',
        gap: 2,
        padding: 6,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.bgElevated,
        borderWidth: 1,
        borderColor: t.colors.border,
        ...t.shadow(2),
      }}
    >
      {REACTIONS.map((emoji) => (
        <Squish
          key={emoji}
          scaleTo={0.85}
          haptic="light"
          onPress={() => onPick(emoji)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: mine === emoji ? t.colors.accentSoft : 'transparent',
          }}
        >
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
        </Squish>
      ))}
    </Animated.View>
  );
}

/**
 * Sits where a typing indicator would. This is the accountability surface:
 * the gap is named, in the thread, without anyone having to say it.
 */
function WaitingRow({ people }: { people: User[] }) {
  const t = useTheme();
  const names =
    people.length === 1
      ? people[0].display_name.split(' ')[0]
      : people.length === 2
        ? people.map((p) => p.display_name.split(' ')[0]).join(' and ')
        : `${people
            .slice(0, 2)
            .map((p) => p.display_name.split(' ')[0])
            .join(', ')} +${people.length - 2}`;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginBottom: t.space.xl }}
    >
      <View style={{ flexDirection: 'row' }}>
        {people.slice(0, 3).map((p, i) => (
          <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -10, opacity: 0.55 }}>
            <Avatar id={p.id} name={p.display_name} size={26} />
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space.sm,
          paddingHorizontal: t.space.md,
          paddingVertical: 10,
          borderRadius: BUBBLE_R,
          borderBottomLeftRadius: TIGHT_R,
          backgroundColor: t.colors.surfaceAlt,
        }}
      >
        <Dots />
        <Text variant="caption" color="inkSoft" style={{ fontSize: 11 }}>
          waiting on {names}
        </Text>
      </View>
    </Animated.View>
  );
}

function Dots() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 170} color={t.colors.inkFaint} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const p = useSharedValue(0.35);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 380 }), withTiming(0.35, { duration: 380 })),
        -1,
        false
      )
    );
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.85 + p.value * 0.25 }] }));
  return <Animated.View style={[style, { width: 5, height: 5, borderRadius: 3, backgroundColor: color }]} />;
}

/**
 * Where the keyboard would be. This is the whole rule made physical: one
 * photo a day, and once the day is spent the composer is closed, not hidden.
 */
function Composer({
  iPosted,
  myAngles,
  onCapture,
}: {
  iPosted: boolean;
  myAngles: Angle[];
  onCapture: (angle: Angle) => void;
}) {
  const t = useTheme();
  const remaining = (ANGLES as Angle[]).filter((a) => !myAngles.includes(a));
  const spent = iPosted && remaining.length === 0;

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (iPosted) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.015, { duration: 1100 }),
        withTiming(1, { duration: 1100 })
      ),
      -1,
      true
    );
  }, [iPosted, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (spent) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space.sm,
          paddingVertical: t.space.lg,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.surfaceAlt,
          borderWidth: 1,
          borderColor: t.colors.border,
        }}
      >
        <Ionicons name="checkmark-circle" size={16} color={t.colors.mint} />
        <Text variant="caption" color="inkSoft">
          That is today. Come back tomorrow.
        </Text>
      </View>
    );
  }

  const label = iPosted ? `Add your ${remaining[0]} angle` : "Send today's photo";

  return (
    <Animated.View style={iPosted ? undefined : pulseStyle}>
      <Squish
        scaleTo={0.97}
        haptic="medium"
        onPress={() => onCapture(remaining[0] ?? 'front')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space.md,
          paddingVertical: 14,
          paddingHorizontal: t.space.lg,
          borderRadius: t.radius.pill,
          backgroundColor: iPosted ? t.colors.surface : t.colors.accent,
          borderWidth: iPosted ? 1 : 0,
          borderColor: t.colors.border,
          ...t.shadow(iPosted ? 1 : 2),
        }}
      >
        <Ionicons name="camera" size={19} color={iPosted ? t.colors.accent : '#FFFFFF'} />
        <Text
          variant="bodyStrong"
          style={{ flex: 1, color: iPosted ? t.colors.ink : '#FFFFFF' }}
        >
          {label}
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iPosted ? t.colors.accentSoft : 'rgba(255,255,255,0.22)',
          }}
        >
          <Ionicons name="arrow-up" size={15} color={iPosted ? t.colors.accent : '#FFFFFF'} />
        </View>
      </Squish>
      {!iPosted ? (
        <Text variant="caption" color="inkFaint" center style={{ marginTop: t.space.sm, fontSize: 10 }}>
          One photo a day. It goes to every squad at once.
        </Text>
      ) : null}
    </Animated.View>
  );
}
