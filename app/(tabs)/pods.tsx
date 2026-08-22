import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyState, Squish, TAB_BAR_HEIGHT, Text } from '@/components';
import type { User } from '@/db/types';
import { CheckInCard } from '@/features/CheckInCard';
import { PodGrid } from '@/features/PodGrid';
import { formatDay } from '@/lib/date';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

export default function PodsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, pods, feed, missing, settings, today, react, refresh } = useStore();

  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // feed (posted) plus missing (not posted) is exactly the roster across every
  // pod I belong to, deduped - no extra query needed.
  const roster = useMemo<User[]>(() => {
    const map = new Map<string, User>();
    for (const item of feed) map.set(item.user.id, item.user);
    for (const u of missing) map.set(u.id, u);
    return [...map.values()];
  }, [feed, missing]);

  const visible = selected ? feed.filter((f) => f.user.id === selected) : feed;

  const padding = {
    paddingTop: insets.top + t.space.md,
    paddingHorizontal: t.space.xl,
    paddingBottom: insets.bottom + TAB_BAR_HEIGHT + t.space.xxl,
  };

  if (!pods.length) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={padding}>
        <Header onNew={() => router.push('/pod/new')} onJoin={() => router.push('/pod/join')} />
        <EmptyState
          icon="people-outline"
          title="No pods yet"
          body="Accountability needs at least one other person. Start a pod and send the invite link to two or three friends."
          actionLabel="Create a pod"
          onAction={() => router.push('/pod/new')}
        />
      </ScrollView>
    );
  }

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
      <Header onNew={() => router.push('/pod/new')} onJoin={() => router.push('/pod/join')} />

      {/* Pod chips. "All pods" is the union board; a specific pod opens its page. */}
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
              onPress={() => (p.id === 'all' ? setSelected(null) : router.push(`/pod/${p.id}`))}
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

      <Card padded="lg" radiusKey="xxl" style={{ marginTop: t.space.xl }}>
        <PodGrid
          members={roster}
          items={feed}
          meId={me?.id ?? ''}
          blurMine={settings.blur_face === 1}
          selectedId={selected}
          onSelect={setSelected}
          onCapture={() => router.push({ pathname: '/capture', params: { angle: 'front' } })}
        />
      </Card>

      <Animated.View layout={LinearTransition} style={{ marginTop: t.space.xxl }}>
        <Text variant="caption" color="inkSoft" eyebrow>
          {selected ? 'Filtered' : formatDay(today)}
        </Text>
        <View style={{ marginTop: t.space.md }}>
          {visible.length ? (
            visible.map((item, i) => (
              <CheckInCard
                key={item.checkin.id}
                item={item}
                index={i}
                meId={me?.id ?? ''}
                settings={settings}
                onReact={(id, emoji) => void react(id, emoji)}
              />
            ))
          ) : (
            <EmptyState
              icon="sunny-outline"
              title="Nobody has posted yet"
              body="Be the one who goes first. The board fills in as your pod checks in."
            />
          )}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function Header({ onNew, onJoin }: { onNew: () => void; onJoin: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="title">Pods</Text>
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
