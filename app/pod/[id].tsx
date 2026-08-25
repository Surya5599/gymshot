import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Avatar, Button, Card, EmptyState, Screen, Squish, Text } from '@/components';
import { POD_MAX_MEMBERS } from '@/db/queries';
import type { Angle, FeedItem, Pod, User } from '@/db/types';
import { PodThread } from '@/features/PodThread';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

export default function PodScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, pods, settings, today, todayPhotos, feedForPod, members, react, leavePod } = useStore();

  const pod: Pod | undefined = pods.find((p) => p.id === id);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [roster, setRoster] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [feed, list] = await Promise.all([feedForPod(id), members(id)]);
    setItems(feed.items);
    setRoster(list);
  }, [id, feedForPod, members]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const myAngles = useMemo(() => todayPhotos.map((p) => p.angle as Angle), [todayPhotos]);

  if (!pod) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Squad not found"
          body="You may have left this squad, or it was removed when the last member left."
          actionLabel="Back to squads"
          onAction={() => router.replace('/(tabs)/pods')}
        />
      </Screen>
    );
  }

  const inviteUrl = Linking.createURL('/pod/join', { queryParams: { code: pod.invite_code } });
  const full = roster.length >= POD_MAX_MEMBERS;

  return (
    <Screen>
      {/* Chat-style header: back, pod identity, and the roster as a face pile. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
        <Squish
          scaleTo={0.88}
          onPress={() => router.back()}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: t.colors.surface,
            borderWidth: 1,
            borderColor: t.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.ink} />
        </Squish>
        <Text style={{ fontSize: 22 }}>{pod.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {pod.name}
          </Text>
          <Text variant="caption" color="inkFaint">
            {items.length} of {roster.length} in today
          </Text>
        </View>
        <Squish
          scaleTo={0.9}
          onPress={() => setShowInvite((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {roster.slice(0, 4).map((u, i) => (
            <View key={u.id} style={{ marginLeft: i === 0 ? 0 : -12 }}>
              <Avatar id={u.id} name={u.display_name} size={28} />
            </View>
          ))}
          {roster.length > 4 ? (
            <View
              style={{
                marginLeft: -12,
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: t.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="caption" color="inkSoft" style={{ fontSize: 10 }}>
                +{roster.length - 4}
              </Text>
            </View>
          ) : null}
        </Squish>
      </View>

      {/* Invite details hide behind the face pile - not permanent thread furniture. */}
      {showInvite ? (
        <Card padded="lg" radiusKey="xl" tint="surfaceAlt" level={0} style={{ marginTop: t.space.lg }}>
          <Text variant="label" color="inkSoft">
            INVITE CODE
          </Text>
          <Text variant="title" style={{ letterSpacing: 6, marginTop: 4 }}>
            {pod.invite_code}
          </Text>
          <Text variant="caption" color="inkFaint" style={{ marginTop: 4 }}>
            {full
              ? 'This squad is full. Small squads are the point.'
              : 'Invite-only. A squad never appears in search or suggestions.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: t.space.md, marginTop: t.space.lg }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Copy code"
                variant="secondary"
                icon="copy-outline"
                onPress={async () => {
                  await Clipboard.setStringAsync(pod.invite_code);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Share link"
                icon="share-outline"
                disabled={full}
                onPress={() =>
                  void Share.share({
                    message: `Join my GymShot pod "${pod.name}": ${inviteUrl}`,
                  })
                }
              />
            </View>
          </View>
          <Button
            label="Leave squad"
            variant="ghost"
            onPress={() =>
              Alert.alert(
                'Leave this squad?',
                'Your check-ins stay on your device. The squad stops seeing them.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Leave',
                    style: 'destructive',
                    onPress: async () => {
                      await leavePod(pod.id);
                      router.replace('/(tabs)/pods');
                    },
                  },
                ]
              )
            }
            style={{ marginTop: t.space.sm }}
          />
        </Card>
      ) : null}

      <PodThread
        items={items}
        members={roster}
        meId={me?.id ?? ''}
        settings={settings}
        day={today}
        myAngles={myAngles}
        onReact={async (cid, emoji) => {
          await react(cid, emoji);
          await load();
        }}
        onCapture={(angle) => router.push({ pathname: '/capture', params: { angle } })}
      />
    </Screen>
  );
}
