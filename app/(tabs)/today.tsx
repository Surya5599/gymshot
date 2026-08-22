import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import {
  Avatar,
  Button,
  Card,
  PhotoTile,
  Screen,
  Squish,
  StatPill,
  StreakRing,
  Text,
  Toggle,
} from '@/components';
import { ANGLES, type Angle } from '@/db/types';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

const ANGLE_LABEL: Record<Angle, string> = { front: 'Front', side: 'Side', back: 'Back' };

export default function TodayScreen() {
  const t = useTheme();
  const router = useRouter();
  const {
    me,
    pods,
    settings,
    streak,
    todayCheckIn,
    todayPhotos,
    todayMetrics,
    feed,
    missing,
    setTrained,
    setNote,
    syncHealth,
    healthLabel,
  } = useStore();

  const [noteDraft, setNoteDraft] = useState(todayCheckIn?.note ?? '');
  const [syncing, setSyncing] = useState(false);

  React.useEffect(() => {
    setNoteDraft(todayCheckIn?.note ?? '');
  }, [todayCheckIn?.id, todayCheckIn?.note]);

  const captured = new Map(todayPhotos.map((p) => [p.angle as Angle, p]));
  const hasAny = captured.size > 0;
  const podPosted = feed.filter((f) => !f.user.is_me).length;
  const podMissing = missing.filter((u) => !u.is_me);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <Screen tabBarPad>
      <Animated.View entering={FadeInDown.duration(360)}>
        <Text variant="caption" color="inkSoft" eyebrow>
          {greeting}
        </Text>
        <Text variant="title">{me?.display_name ?? 'You'}</Text>
      </Animated.View>

      <Animated.View
        entering={FadeIn.delay(80).duration(420)}
        style={{ alignItems: 'center', marginTop: t.space.xl }}
      >
        <StreakRing progress={streak.monthProgress} streak={streak.current} />
        <Text variant="caption" color="inkFaint" style={{ marginTop: t.space.sm }}>
          {streak.monthLogged} of {streak.monthDays} days this month
          {streak.best > streak.current ? `  ·  best ${streak.best}` : ''}
        </Text>
      </Animated.View>

      {/* ---------------------------------------------------- today's photo */}
      <Animated.View layout={LinearTransition.springify().damping(20)} style={{ marginTop: t.space.xxl }}>
        {hasAny ? (
          <Card padded="lg" radiusKey="xxl">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="heading">Today is logged</Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: t.colors.mintSoft,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: t.radius.pill,
                }}
              >
                <Ionicons name="checkmark-circle" size={14} color={t.colors.mint} />
                <Text variant="caption" color="mint">
                  posted to {pods.length} pod{pods.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: t.space.md, marginTop: t.space.lg }}>
              {ANGLES.map((angle) => {
                const photo = captured.get(angle);
                return (
                  <Squish
                    key={angle}
                    scaleTo={0.95}
                    onPress={() => router.push({ pathname: '/capture', params: { angle } })}
                    style={{ flex: 1 }}
                  >
                    {photo?.uri ? (
                      <PhotoTile
                        uri={photo.uri}
                        seed={`${me?.id}-${angle}`}
                        blur={settings.blur_face === 1}
                        label={ANGLE_LABEL[angle]}
                        style={{ aspectRatio: 0.72 }}
                      />
                    ) : (
                      <View
                        style={{
                          aspectRatio: 0.72,
                          borderRadius: t.radius.lg,
                          borderWidth: 1.5,
                          borderStyle: 'dashed',
                          borderColor: t.colors.borderStrong,
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons name="add" size={20} color={t.colors.inkFaint} />
                        <Text variant="caption" color="inkFaint">
                          {ANGLE_LABEL[angle]}
                        </Text>
                      </View>
                    )}
                  </Squish>
                );
              })}
            </View>
          </Card>
        ) : (
          <Card padded="xxl" radiusKey="xxl" tint="accentSoft" bordered={false} level={2}>
            <Text variant="heading" color="accentInk">
              Today is still open
            </Text>
            <Text color="inkSoft" style={{ marginTop: 6 }}>
              One photo, aligned to yesterday. Your pod sees it, nobody else does.
            </Text>
            <Button
              label="Take today's photo"
              icon="camera"
              size="lg"
              onPress={() => router.push({ pathname: '/capture', params: { angle: 'front' } })}
              style={{ marginTop: t.space.xl }}
            />
          </Card>
        )}
      </Animated.View>

      {/* ---------------------------------------------------------- effort */}
      <Animated.View layout={LinearTransition} style={{ marginTop: t.space.lg }}>
        <Card padded="lg" radiusKey="xl">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: t.space.md }}>
              <Text variant="bodyStrong">I trained today</Text>
              <Text variant="caption" color="inkFaint">
                Context for the photo, not a fitness log
              </Text>
            </View>
            <Toggle value={todayCheckIn?.trained === 1} onChange={(v) => void setTrained(v)} />
          </View>

          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            onEndEditing={() => void setNote(noteDraft)}
            placeholder="leg day, felt strong"
            placeholderTextColor={t.colors.inkFaint}
            maxLength={140}
            multiline
            style={{
              marginTop: t.space.md,
              backgroundColor: t.colors.surfaceSunken,
              borderRadius: t.radius.md,
              paddingHorizontal: t.space.md,
              paddingVertical: t.space.md,
              minHeight: 62,
              color: t.colors.ink,
              fontFamily: t.type.body.fontFamily,
              fontSize: 15,
            }}
          />
        </Card>
      </Animated.View>

      {/* ---------------------------------------------------------- health */}
      <Animated.View layout={LinearTransition} style={{ marginTop: t.space.lg }}>
        {settings.health_connected === 1 ? (
          <View style={{ flexDirection: 'row', gap: t.space.md }}>
            <StatPill
              icon="scale-outline"
              tint="lilac"
              value={todayMetrics?.weight_kg ? `${todayMetrics.weight_kg} kg` : '--'}
              label={settings.share_weight ? 'weight - shared' : 'weight - private'}
            />
            <StatPill
              icon="flame-outline"
              tint="sun"
              value={todayMetrics?.calories_in ? `${Math.round(todayMetrics.calories_in)}` : '--'}
              label={settings.share_calories ? 'kcal in - shared' : 'kcal in - private'}
            />
          </View>
        ) : (
          <Card padded="lg" radiusKey="xl" tint="surfaceAlt" level={0}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
              <Ionicons name="pulse-outline" size={20} color={t.colors.lilac} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Pull in weight and calories</Text>
                <Text variant="caption" color="inkFaint">
                  Read-only from {healthLabel}. Nothing is ever written back.
                </Text>
              </View>
            </View>
            <Button
              label={syncing ? 'Syncing' : 'Connect'}
              variant="secondary"
              loading={syncing}
              onPress={async () => {
                setSyncing(true);
                try {
                  await syncHealth();
                } finally {
                  setSyncing(false);
                }
              }}
              style={{ marginTop: t.space.md }}
            />
          </Card>
        )}
      </Animated.View>

      {/* ------------------------------------------------------- pod status */}
      <Animated.View layout={LinearTransition} style={{ marginTop: t.space.lg }}>
        <Squish scaleTo={0.98} onPress={() => router.push('/(tabs)/pods')}>
          <Card padded="lg" radiusKey="xl">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">
                {podPosted > 0 ? `${podPosted} in your pods posted` : 'Nobody has posted yet'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={t.colors.inkFaint} />
            </View>
            <View style={{ flexDirection: 'row', marginTop: t.space.md, gap: t.space.sm, flexWrap: 'wrap' }}>
              {feed
                .filter((f) => !f.user.is_me)
                .slice(0, 6)
                .map((f) => (
                  <Avatar key={f.user.id} id={f.user.id} name={f.user.display_name} size={34} ring="done" />
                ))}
              {podMissing.slice(0, 4).map((u) => (
                <Avatar key={u.id} id={u.id} name={u.display_name} size={34} ring="missed" />
              ))}
              {podPosted === 0 && podMissing.length === 0 ? (
                <Text variant="caption" color="inkFaint">
                  Invite a couple of friends to make this matter.
                </Text>
              ) : null}
            </View>
          </Card>
        </Squish>
      </Animated.View>
    </Screen>
  );
}
