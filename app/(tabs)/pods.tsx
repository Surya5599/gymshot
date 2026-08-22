import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Squish, TAB_BAR_HEIGHT, Text } from '@/components';
import type { Angle, User } from '@/db/types';
import { PodThread } from '@/features/PodThread';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

export default function PodsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, pods, feed, missing, settings, today, todayPhotos, react, refresh } = useStore();

  const [refreshing, setRefreshing] = useState(false);

  // feed (posted) plus missing (not posted) is exactly the roster across every
  // pod I belong to, deduped - no extra query needed.
  const roster = useMemo<User[]>(() => {
    const map = new Map<string, User>();
    for (const item of feed) map.set(item.user.id, item.user);
    for (const u of missing) map.set(u.id, u);
    return [...map.values()];
  }, [feed, missing]);

  const myAngles = useMemo(() => todayPhotos.map((p) => p.angle as Angle), [todayPhotos]);

  const padding = {
    paddingTop: insets.top + t.space.md,
    paddingHorizontal: t.space.xl,
    paddingBottom: insets.bottom + TAB_BAR_HEIGHT + t.space.xxl,
  };

  if (!pods.length) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={padding}>
        <Header
          title="Pods"
          subtitle="no pods yet"
          onNew={() => router.push('/pod/new')}
          onJoin={() => router.push('/pod/join')}
        />
        <EmptyState
          icon="chatbubbles-outline"
          title="No pods yet"
          body="Accountability needs at least one other person. Start a pod and send the invite link to two or three friends."
          actionLabel="Create a pod"
          onAction={() => router.push('/pod/new')}
        />
      </ScrollView>
    );
  }

  const posted = feed.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      contentContainerStyle={padding}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.colors.inkFaint}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <Header
        title="All pods"
        subtitle={`${posted} of ${roster.length} in today`}
        onNew={() => router.push('/pod/new')}
        onJoin={() => router.push('/pod/join')}
      />

      {/* Pod chips: this screen is the merged thread; a chip opens one pod. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: t.space.lg, marginHorizontal: -t.space.xl }}
        contentContainerStyle={{ paddingHorizontal: t.space.xl, gap: t.space.sm }}
      >
        {[{ id: 'all', name: 'All pods', emoji: '\u{1F310}' }, ...pods].map((p) => {
          const active = p.id === 'all';
          return (
            <Squish
              key={p.id}
              scaleTo={0.94}
              onPress={() => p.id !== 'all' && router.push(`/pod/${p.id}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: t.space.lg,
                paddingVertical: 10,
                borderRadius: t.radius.pill,
                backgroundColor: active ? t.colors.ink : t.colors.surface,
                borderWidth: 1,
                borderColor: active ? 'transparent' : t.colors.border,
              }}
            >
              <Text style={{ fontSize: 13 }}>{p.emoji}</Text>
              <Text variant="label" style={{ color: active ? t.colors.inkInverse : t.colors.ink }}>
                {p.name}
              </Text>
            </Squish>
          );
        })}
      </ScrollView>

      <View style={{ marginTop: t.space.sm }}>
        <PodThread
          items={feed}
          members={roster}
          meId={me?.id ?? ''}
          settings={settings}
          day={today}
          myAngles={myAngles}
          onReact={(id, emoji) => void react(id, emoji)}
          onCapture={(angle) => router.push({ pathname: '/capture', params: { angle } })}
        />
      </View>
    </ScrollView>
  );
}

function Header({
  title,
  subtitle,
  onNew,
  onJoin,
}: {
  title: string;
  subtitle: string;
  onNew: () => void;
  onJoin: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View>
        <Text variant="title">{title}</Text>
        <Text variant="caption" color="inkFaint">
          {subtitle}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: t.space.sm }}>
        <RoundButton icon="enter-outline" onPress={onJoin} />
        <RoundButton icon="add" onPress={onNew} />
      </View>
    </View>
  );
}

function RoundButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const t = useTheme();
  return (
    <Squish
      scaleTo={0.88}
      onPress={onPress}
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
      <Ionicons name={icon} size={18} color={t.colors.ink} />
    </Squish>
  );
}
