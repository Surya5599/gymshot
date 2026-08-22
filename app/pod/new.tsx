import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Screen, Squish, Text } from '@/components';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

const POD_EMOJI = [
  '\u{1F3CB}\u{FE0F}',
  '\u{1F525}',
  '\u{1F962}',
  '\u{1F31F}',
  '\u{1F436}',
  '\u{1F3AF}',
  '\u{1F30A}',
  '\u{1F344}',
];

export default function NewPodScreen() {
  const t = useTheme();
  const router = useRouter();
  const { createPod } = useStore();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(POD_EMOJI[0]);
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <Text variant="title">New pod</Text>
      <Text color="inkSoft" style={{ marginTop: 4 }}>
        Three to eight people. Everyone sees everyone's daily photo, and nothing leaves the group.
      </Text>

      <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.xl }}>
        <Text variant="label" color="inkSoft">
          NAME
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Gym friends"
          placeholderTextColor={t.colors.inkFaint}
          maxLength={24}
          autoFocus
          style={{
            marginTop: t.space.sm,
            backgroundColor: t.colors.surfaceSunken,
            borderRadius: t.radius.md,
            paddingHorizontal: t.space.md,
            paddingVertical: t.space.md,
            color: t.colors.ink,
            fontFamily: t.type.body.fontFamily,
            fontSize: 17,
          }}
        />

        <Text variant="label" color="inkSoft" style={{ marginTop: t.space.lg }}>
          BADGE
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginTop: t.space.sm }}>
          {POD_EMOJI.map((e) => (
            <Squish
              key={e}
              scaleTo={0.88}
              onPress={() => setEmoji(e)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: emoji === e ? t.colors.accentSoft : t.colors.surfaceSunken,
                borderWidth: emoji === e ? 1.5 : 0,
                borderColor: t.colors.accent,
              }}
            >
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </Squish>
          ))}
        </View>
      </Card>

      <Button
        label="Create pod"
        size="lg"
        loading={busy}
        disabled={name.trim().length < 2}
        onPress={async () => {
          setBusy(true);
          try {
            const pod = await createPod(name, emoji);
            router.replace(`/pod/${pod.id}`);
          } finally {
            setBusy(false);
          }
        }}
        style={{ marginTop: t.space.xl }}
      />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
