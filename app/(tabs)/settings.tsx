import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Button, Card, Screen, Segmented, Squish, Text, Toggle } from '@/components';
import { DEMO_POD_NAME } from '@/lib/demo';
import { formatBytes, storageFootprint } from '@/lib/photos';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

const TIMER_CHOICES = [
  { value: '0', label: 'Off' },
  { value: '3', label: '3s' },
  { value: '5', label: '5s' },
  { value: '10', label: '10s' },
];

const HOURS = [
  { value: '7', label: '7am' },
  { value: '8', label: '8am' },
  { value: '18', label: '6pm' },
  { value: '20', label: '8pm' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const {
    me,
    pods,
    settings,
    streak,
    healthLabel,
    setSetting,
    setReminders,
    syncHealth,
    seedDemoPod,
    clearDemoData,
    resetEverything,
  } = useStore();

  const [busy, setBusy] = useState<string | null>(null);
  const footprint = storageFootprint();
  const hasDemo = pods.some((p) => p.name === DEMO_POD_NAME);

  return (
    <Screen tabBarPad>
      <Text variant="title">You</Text>

      <Card padded="lg" radiusKey="xxl" style={{ marginTop: t.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
          <Avatar id={me?.id ?? 'me'} name={me?.display_name ?? 'You'} size={54} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{me?.display_name ?? 'You'}</Text>
            <Text variant="caption" color="inkFaint">
              {streak.current} day streak - best {streak.best} - {pods.length} pod
              {pods.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </Card>

      {/* ------------------------------------------------------------ privacy */}
      <Section title="Privacy" note="These apply to every pod at once. One photo goes out unmodified, so a per-pod setting would be a promise the app could not keep.">
        <Row
          icon="eye-off-outline"
          title="Blur my face"
          subtitle="Applied everywhere, including your own timeline"
          right={
            <Toggle
              value={settings.blur_face === 1}
              onChange={(v) => void setSetting('blur_face', v ? 1 : 0)}
            />
          }
        />
        <Row
          icon="phone-portrait-outline"
          title="Keep photos on this device"
          subtitle="No photo leaves the phone, even once sync ships"
          right={
            <Toggle
              value={settings.local_only === 1}
              onChange={(v) => void setSetting('local_only', v ? 1 : 0)}
            />
          }
        />
      </Section>

      {/* ------------------------------------------------------ what pods see */}
      <Section title="What your pod sees" note="Photo and streak are always shared - that is the point. Numbers are opt-in per metric.">
        <Row
          icon="barbell-outline"
          title="Trained today"
          subtitle="The toggle and your note"
          right={
            <Toggle
              value={settings.share_trained === 1}
              onChange={(v) => void setSetting('share_trained', v ? 1 : 0)}
            />
          }
        />
        <Row
          icon="scale-outline"
          title="Weight"
          subtitle="Off by default - more sensitive than effort"
          right={
            <Toggle
              value={settings.share_weight === 1}
              onChange={(v) => void setSetting('share_weight', v ? 1 : 0)}
            />
          }
        />
        <Row
          icon="flame-outline"
          title="Calories in"
          subtitle="Off by default"
          right={
            <Toggle
              value={settings.share_calories === 1}
              onChange={(v) => void setSetting('share_calories', v ? 1 : 0)}
            />
          }
        />
      </Section>

      {/* ------------------------------------------------------------- health */}
      <Section title="Health data" note={`Read-only from ${healthLabel}. Podshot never writes to Health and has no food or weight entry of its own.`}>
        <Row
          icon="pulse-outline"
          title={settings.health_connected === 1 ? 'Connected' : 'Not connected'}
          subtitle={healthLabel}
          right={
            <Button
              label={settings.health_connected === 1 ? 'Resync' : 'Connect'}
              variant="secondary"
              loading={busy === 'health'}
              onPress={async () => {
                setBusy('health');
                try {
                  await syncHealth();
                } finally {
                  setBusy(null);
                }
              }}
            />
          }
        />
      </Section>

      {/* ------------------------------------------------------------- camera */}
      <Section title="Camera" note="The timer also has a shortcut on the capture screen - the icon top-right cycles the same options.">
        <Row
          icon="timer-outline"
          title="Self-timer"
          subtitle="Delay before the shutter fires, so you can get into position"
        />
        <View style={{ marginTop: t.space.sm }}>
          <Segmented
            options={TIMER_CHOICES}
            value={String(settings.timer_seconds ?? 0)}
            onChange={(v) => void setSetting('timer_seconds', Number(v))}
          />
        </View>
      </Section>

      {/* ---------------------------------------------------------- reminders */}
      <Section title="Daily reminder">
        <Row
          icon="notifications-outline"
          title="Remind me to check in"
          subtitle="A local notification, no server involved"
          right={
            <Toggle
              value={settings.reminders_on === 1}
              onChange={(v) => void setReminders(v)}
            />
          }
        />
        {settings.reminders_on === 1 ? (
          <View style={{ marginTop: t.space.md }}>
            <Segmented
              options={HOURS}
              value={String(settings.reminder_hour)}
              onChange={(v) => void setReminders(true, Number(v))}
            />
          </View>
        ) : null}
      </Section>

      {/* --------------------------------------------------------------- pods */}
      <Section title="Pods">
        {pods.map((p) => (
          <Squish key={p.id} scaleTo={0.98} onPress={() => router.push(`/pod/${p.id}`)}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space.md,
                paddingVertical: t.space.md,
              }}
            >
              <Text style={{ fontSize: 20 }}>{p.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{p.name}</Text>
                <Text variant="caption" color="inkFaint">
                  code {p.invite_code}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.colors.inkFaint} />
            </View>
          </Squish>
        ))}
        <View style={{ flexDirection: 'row', gap: t.space.md, marginTop: t.space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="New pod" variant="secondary" icon="add" onPress={() => router.push('/pod/new')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Join" variant="secondary" icon="enter-outline" onPress={() => router.push('/pod/join')} />
          </View>
        </View>
      </Section>

      {/* ------------------------------------------------------------ storage */}
      <Section title="Storage">
        <Row
          icon="folder-outline"
          title={`${footprint.files} photo${footprint.files === 1 ? '' : 's'}`}
          subtitle={`${formatBytes(footprint.bytes)} in the app's private folder`}
        />
      </Section>

      {/* --------------------------------------------------------------- demo */}
      <Section title="Demo data" note="There is no sync backend yet, so a pod of one cannot show the social half of the product. This adds three clearly-labelled demo pod-mates with two weeks of history.">
        <Button
          label={hasDemo ? 'Remove demo pod' : 'Load demo pod'}
          variant="secondary"
          icon={hasDemo ? 'trash-outline' : 'sparkles-outline'}
          loading={busy === 'demo'}
          onPress={async () => {
            setBusy('demo');
            try {
              if (hasDemo) await clearDemoData();
              else await seedDemoPod();
            } finally {
              setBusy(null);
            }
          }}
        />
      </Section>

      <Section title="Danger zone">
        <Button
          label="Delete everything"
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            Alert.alert(
              'Delete everything?',
              'Every photo, check-in, and pod on this device is removed. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await resetEverything();
                    router.replace('/onboarding');
                  },
                },
              ]
            )
          }
        />
      </Section>

      <Text variant="caption" color="inkFaint" center style={{ marginTop: t.space.xl }}>
        Podshot 0.1.0 - photo-first, pod-only, never a workout tracker.
      </Text>
    </Screen>
  );
}

/* ------------------------------------------------------------------ pieces */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ marginTop: t.space.xxl }}>
      <Text variant="caption" color="inkSoft" eyebrow>
        {title}
      </Text>
      <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.md }}>
        {children}
      </Card>
      {note ? (
        <Text variant="caption" color="inkFaint" style={{ marginTop: t.space.sm, lineHeight: 16 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingVertical: t.space.sm,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: t.colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={16} color={t.colors.inkSoft} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="inkFaint">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}
