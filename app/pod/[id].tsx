import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Squish, Text } from '@/components';
import type { FeedItem, Pod, User } from '@/db/types';
import { CheckInCard } from '@/features/CheckInCard';
import { PodGrid } from '@/features/PodGrid';
import { POD_MAX_MEMBERS } from '@/db/queries';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

export default function PodScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, pods, settings, feedForPod, members, react, leavePod } = useStore();

  const pod: Pod | undefined = pods.find((p) => p.id === id);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [roster, setRoster] = useState<User[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

  if (!pod) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Pod not found"
          body="You may have left this pod, or it was removed when the last member left."
          actionLabel="Back to pods"
          onAction={() => router.replace('/(tabs)/pods')}
        />
      </Screen>
    );
  }

  const inviteUrl = Linking.createURL('/pod/join', { queryParams: { code: pod.invite_code } });
  const shown = selected ? items.filter((i) => i.user.id === selected) : items;
  const full = roster.length >= POD_MAX_MEMBERS;

  return (
    <Screen>
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
        <Text style={{ fontSize: 24 }}>{pod.emoji}</Text>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {pod.name}
        </Text>
      </View>

      {/* -------------------------------------------------------- the board */}
      <Card padded="lg" radiusKey="xxl" style={{ marginTop: t.space.xl }}>
        <PodGrid
          members={roster}
          items={items}
          meId={me?.id ?? ''}
          blurMine={settings.blur_face === 1}
          selectedId={selected}
          onSelect={setSelected}
          onCapture={() => router.push({ pathname: '/capture', params: { angle: 'front' } })}
        />
      </Card>

      {/* -------------------------------------------------------------- invite */}
      <Card padded="lg" radiusKey="xl" tint="surfaceAlt" level={0} style={{ marginTop: t.space.md }}>
        <Text variant="label" color="inkSoft">
          INVITE CODE
        </Text>
        <Text variant="title" style={{ letterSpacing: 6, marginTop: 4 }}>
          {pod.invite_code}
        </Text>
        <Text variant="caption" color="inkFaint" style={{ marginTop: 4 }}>
          {full
            ? 'This pod is full. Small pods are the point.'
            : 'Invite-only. A pod never appears in search or suggestions.'}
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
                  message: `Join my Podshot pod "${pod.name}": ${inviteUrl}`,
                })
              }
            />
          </View>
        </View>
      </Card>

      {/* ---------------------------------------------------------- today's feed */}
      <View style={{ marginTop: t.space.xxl }}>
        <Text variant="caption" color="inkSoft" eyebrow>
          Today in this pod
        </Text>
        <View style={{ marginTop: t.space.md }}>
          {shown.length ? (
            shown.map((item, i) => (
              <CheckInCard
                key={item.checkin.id}
                item={item}
                index={i}
                meId={me?.id ?? ''}
                settings={settings}
                onReact={async (cid, emoji) => {
                  await react(cid, emoji);
                  await load();
                }}
              />
            ))
          ) : (
            <EmptyState
              icon="hourglass-outline"
              title="Quiet so far"
              body="Nobody in this pod has checked in today."
            />
          )}
        </View>
      </View>

      <Button
        label="Leave pod"
        variant="ghost"
        onPress={() =>
          Alert.alert('Leave this pod?', 'Your check-ins stay on your device. The pod stops seeing them.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Leave',
              style: 'destructive',
              onPress: async () => {
                await leavePod(pod.id);
                router.replace('/(tabs)/pods');
              },
            },
          ])
        }
        style={{ marginTop: t.space.xxl }}
      />
    </Screen>
  );
}
