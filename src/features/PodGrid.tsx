import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Avatar, PhotoTile, Squish, Text } from '@/components';
import type { FeedItem, User } from '@/db/types';
import { ANGLES, type Angle } from '@/db/types';
import { relativeTime } from '@/lib/date';
import { useTheme } from '@/theme';

const COLUMNS = 3;
const TILE_RATIO = 0.76;

type Props = {
  members: User[];
  /** Today's check-ins, whoever has posted. */
  items: FeedItem[];
  meId: string;
  /** My own face-blur preference; only ever applied to my own tile. */
  blurMine: boolean;
  selectedId: string | null;
  onSelect: (userId: string | null) => void;
  /** Opens capture, used when my own tile is still empty. */
  onCapture: () => void;
};

/**
 * The board. One tile per pod member, so "who showed up today" is a single
 * glance rather than a scroll: a real photo means posted, a dashed hollow tile
 * means not yet. Tapping a filled tile filters the feed below to that person.
 */
export function PodGrid({
  members,
  items,
  meId,
  blurMine,
  selectedId,
  onSelect,
  onCapture,
}: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const byUser = useMemo(() => {
    const map = new Map<string, FeedItem>();
    for (const item of items) map.set(item.user.id, item);
    return map;
  }, [items]);

  // Posted first, then everyone still open; me pinned to the front of my group
  // so my own status is always in the same place.
  const ordered = useMemo(() => {
    const rank = (u: User) => (byUser.has(u.id) ? 0 : 1) * 10 + (u.id === meId ? 0 : 1);
    return [...members].sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));
  }, [members, byUser, meId]);

  const posted = ordered.filter((u) => byUser.has(u.id)).length;
  const gap = t.space.sm;
  const tileWidth = width > 0 ? (width - gap * (COLUMNS - 1)) / COLUMNS : 0;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text variant="caption" color="inkSoft" eyebrow>
            Checked in today
          </Text>
          <Text variant="title" style={{ marginTop: 2 }}>
            {posted}
            <Text variant="heading" color="inkFaint">
              {' '}
              / {members.length}
            </Text>
          </Text>
        </View>
        {selectedId ? (
          <Squish
            scaleTo={0.94}
            onPress={() => onSelect(null)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: t.space.md,
              paddingVertical: 7,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.surfaceAlt,
            }}
          >
            <Ionicons name="close" size={13} color={t.colors.inkSoft} />
            <Text variant="caption" color="inkSoft">
              Show all
            </Text>
          </Squish>
        ) : null}
      </View>

      <ProgressBar value={members.length ? posted / members.length : 0} />

      <View
        onLayout={onLayout}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap, marginTop: t.space.lg }}
      >
        {tileWidth > 0
          ? ordered.map((user, i) => (
              <MemberTile
                key={user.id}
                user={user}
                item={byUser.get(user.id)}
                isMe={user.id === meId}
                blur={user.id === meId && blurMine}
                width={tileWidth}
                index={i}
                selected={selectedId === user.id}
                onPress={() => {
                  const item = byUser.get(user.id);
                  if (!item) {
                    if (user.id === meId) onCapture();
                    return;
                  }
                  onSelect(selectedId === user.id ? null : user.id);
                }}
              />
            ))
          : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ pieces */

function ProgressBar({ value }: { value: number }) {
  const t = useTheme();
  const p = useSharedValue(0);

  React.useEffect(() => {
    p.value = withDelay(100, withSpring(Math.max(0, Math.min(1, value)), t.motion.springSoft));
  }, [value, p, t.motion.springSoft]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: t.colors.surfaceSunken,
        overflow: 'hidden',
        marginTop: t.space.md,
      }}
    >
      <Animated.View style={[fill, { height: 6, borderRadius: 3, backgroundColor: t.colors.mint }]} />
    </View>
  );
}

function MemberTile({
  user,
  item,
  isMe,
  blur,
  width,
  index,
  selected,
  onPress,
}: {
  user: User;
  item?: FeedItem;
  isMe: boolean;
  blur: boolean;
  width: number;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const height = width / TILE_RATIO;
  const photo = item ? pickPhoto(item) : undefined;
  const firstName = isMe ? 'You' : user.display_name.split(' ')[0];

  return (
    <Animated.View entering={FadeInDown.delay(index * 45).duration(320)} style={{ width }}>
      <Squish scaleTo={0.94} onPress={onPress}>
        {item ? (
          <View
            style={{
              borderRadius: t.radius.lg,
              borderWidth: selected ? 2.5 : 0,
              borderColor: t.colors.accent,
              padding: selected ? 2 : 0,
            }}
          >
            <PhotoTile
              uri={photo?.uri}
              seed={`${user.id}-${photo?.angle ?? 'front'}`}
              blur={blur}
              radiusKey="md"
              style={{ width: '100%', height: selected ? height - 9 : height }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: t.colors.mint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark" size={13} color="#fff" />
            </View>
            {item.checkin.trained === 1 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="barbell" size={11} color="#fff" />
              </View>
            ) : null}
          </View>
        ) : (
          /* Hollow tile: dashed, muted, and for my own row it is the CTA. */
          <View
            style={{
              width: '100%',
              height,
              borderRadius: t.radius.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: isMe ? t.colors.accent : t.colors.borderStrong,
              backgroundColor: isMe ? t.colors.accentSoft : t.colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <View style={{ opacity: isMe ? 1 : 0.45 }}>
              <Avatar id={user.id} name={user.display_name} size={width * 0.4} />
            </View>
            {isMe ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="camera" size={12} color={t.colors.accentInk} />
                <Text variant="caption" color="accentInk" style={{ fontSize: 10 }}>
                  Add
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Squish>

      <Text
        variant="caption"
        color={item ? 'ink' : 'inkFaint'}
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 11, textAlign: 'center' }}
      >
        {firstName}
      </Text>
      <Text
        variant="caption"
        color="inkFaint"
        numberOfLines={1}
        style={{ fontSize: 9, textAlign: 'center', opacity: 0.8 }}
      >
        {item ? relativeTime(item.checkin.created_at) : 'not yet'}
      </Text>
    </Animated.View>
  );
}

/** Prefer front, then side, then back - whatever this person actually posted. */
function pickPhoto(item: FeedItem) {
  for (const angle of ANGLES as Angle[]) {
    const found = item.photos.find((p) => p.angle === angle);
    if (found) return found;
  }
  return item.photos[0];
}
