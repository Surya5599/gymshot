import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Button, Card, EmptyState, PhotoTile, Screen, Segmented, Squish, Text } from '@/components';
import type { Photo } from '@/db/types';
import { ANGLES, type Angle } from '@/db/types';
import { DayKey, daysBetween, formatDay } from '@/lib/date';
import { formatBytes, storageFootprint } from '@/lib/photos';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

type Frame = Photo & { day: DayKey };

export default function JourneyScreen() {
  const t = useTheme();
  const router = useRouter();
  const { settings, streak, timeline, me } = useStore();

  const [angle, setAngle] = useState<Angle>('front');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [footprint, setFootprint] = useState({ files: 0, bytes: 0 });

  const load = useCallback(async () => {
    setFrames(await timeline(angle));
    setFootprint(storageFootprint());
  }, [timeline, angle]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const first = frames[0];
  const last = frames[frames.length - 1];
  const span = first && last ? Math.max(1, daysBetween(first.day, last.day) + 1) : 0;

  return (
    <Screen tabBarPad>
      <Text variant="title">Journey</Text>
      <Text color="inkSoft" style={{ marginTop: 4 }}>
        Your own history. Nobody in your pods can scroll this.
      </Text>

      <View style={{ marginTop: t.space.xl }}>
        <Segmented
          options={ANGLES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
          value={angle}
          onChange={setAngle}
        />
      </View>

      {frames.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title={`No ${angle} photos yet`}
          body="Every photo you take at this angle lands here, oldest first, ready to play back."
          actionLabel="Take one now"
          onAction={() => router.push({ pathname: '/capture', params: { angle } })}
        />
      ) : (
        <>
          {/* Then / now, the payoff view. */}
          <Animated.View entering={FadeIn.duration(360)} style={{ marginTop: t.space.xl }}>
            <View style={{ flexDirection: 'row', gap: t.space.md }}>
              <Compare label={formatDay(first.day)} uri={first.uri} seed={`${me?.id}-a`} blur={settings.blur_face === 1} />
              <Compare label={formatDay(last.day)} uri={last.uri} seed={`${me?.id}-b`} blur={settings.blur_face === 1} />
            </View>
            <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Stat value={`${frames.length}`} label="photos" />
                <Stat value={`${span}`} label="days covered" />
                <Stat value={`${streak.best}`} label="best streak" />
              </View>
              <Button
                label="Play timelapse"
                icon="play"
                onPress={() => router.push({ pathname: '/timelapse', params: { angle } })}
                style={{ marginTop: t.space.lg }}
              />
            </Card>
          </Animated.View>

          {/* Month strips, newest month first. */}
          <Animated.View layout={LinearTransition} style={{ marginTop: t.space.xxl }}>
            {groupByMonth(frames).map(([month, monthFrames]) => (
              <View key={month} style={{ marginBottom: t.space.xl }}>
                <Text variant="caption" color="inkSoft" eyebrow>
                  {monthLabel(month)}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: t.space.sm,
                    marginTop: t.space.md,
                  }}
                >
                  {monthFrames.map((f) => (
                    <Squish
                      key={f.id}
                      scaleTo={0.94}
                      style={{ width: '31.5%' }}
                      onPress={() => router.push({ pathname: '/timelapse', params: { angle, from: f.day } })}
                    >
                      <PhotoTile
                        uri={f.uri}
                        seed={f.id}
                        blur={settings.blur_face === 1}
                        radiusKey="md"
                        style={{ aspectRatio: 0.74 }}
                        label={formatDay(f.day)}
                      />
                    </Squish>
                  ))}
                </View>
              </View>
            ))}
          </Animated.View>

          <Card padded="lg" radiusKey="xl" tint="surfaceAlt" level={0}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              <Ionicons name="folder-outline" size={18} color={t.colors.inkSoft} />
              <Text variant="caption" color="inkSoft" style={{ flex: 1 }}>
                {footprint.files} photo{footprint.files === 1 ? '' : 's'} on this device,{' '}
                {formatBytes(footprint.bytes)}. Stored in the app's private folder.
              </Text>
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

function Compare({
  label,
  uri,
  seed,
  blur,
}: {
  label: string;
  uri: string | null;
  seed: string;
  blur: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PhotoTile uri={uri} seed={seed} blur={blur} radiusKey="lg" style={{ aspectRatio: 0.74 }} />
      <Text variant="caption" color="inkSoft" center style={{ marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" color="inkFaint">
        {label}
      </Text>
    </View>
  );
}

function groupByMonth(frames: Frame[]): [string, Frame[]][] {
  const map = new Map<string, Frame[]>();
  for (const f of frames) {
    const key = f.day.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return y === thisYear ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

