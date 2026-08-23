import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

/**
 * Reached either from the Pods tab or by opening an invite deep link
 * (gymshot://pod/join?code=ABC123), which is why the code can arrive as a param.
 */
export default function JoinPodScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { joinPodByCode } = useStore();

  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attempt = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const pod = await joinPodByCode(value);
      if (!pod) {
        setError('No pod with that code, or it is already at eight members.');
        return;
      }
      router.replace(`/pod/${pod.id}`);
    } finally {
      setBusy(false);
    }
  };

  // A deep link should just work rather than making you press a button.
  useEffect(() => {
    if (params.code && params.code.length === 6) void attempt(params.code.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  return (
    <Screen>
      <Text variant="title">Join a pod</Text>
      <Text color="inkSoft" style={{ marginTop: 4 }}>
        Enter the six-character code a friend sent you.
      </Text>

      <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.xl }}>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABC123"
          placeholderTextColor={t.colors.inkFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          autoFocus
          style={{
            backgroundColor: t.colors.surfaceSunken,
            borderRadius: t.radius.md,
            paddingVertical: t.space.lg,
            textAlign: 'center',
            color: t.colors.ink,
            fontFamily: t.type.title.fontFamily,
            fontSize: 30,
            letterSpacing: 8,
          }}
        />
        {error ? (
          <Text variant="caption" color="accentInk" center style={{ marginTop: t.space.md }}>
            {error}
          </Text>
        ) : null}
      </Card>

      <View style={{ marginTop: t.space.xl }}>
        <Button
          label="Join"
          size="lg"
          loading={busy}
          disabled={code.length !== 6}
          onPress={() => void attempt(code)}
        />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>

      <Text variant="caption" color="inkFaint" style={{ marginTop: t.space.xxl, lineHeight: 17 }}>
        Codes only work while the pod has room. There is no way to browse or search for pods, by
        design.
      </Text>
    </Screen>
  );
}
