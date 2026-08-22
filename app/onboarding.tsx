import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Button, Card, Screen, Squish, Text } from '@/components';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

type Step = 'name' | 'pod' | 'privacy';

const POD_EMOJI = ['\u{1F3CB}\u{FE0F}', '\u{1F525}', '\u{1F962}', '\u{1F31F}', '\u{1F436}', '\u{1F3AF}'];

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const { signUp, createPod, joinPodByCode, seedDemoPod, setSetting } = useStore();

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [podName, setPodName] = useState('');
  const [emoji, setEmoji] = useState(POD_EMOJI[0]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (action: 'create' | 'join' | 'solo' | 'demo') => {
    setBusy(true);
    setError(null);
    try {
      await signUp(name);
      if (action === 'create') await createPod(podName || `${name.split(' ')[0]}'s pod`, emoji);
      if (action === 'join') {
        const pod = await joinPodByCode(code);
        if (!pod) {
          setError('No pod with that code, or it is already full.');
          return;
        }
      }
      if (action === 'demo') await seedDemoPod();
      router.replace('/(tabs)/today');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(420)}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: t.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="camera" size={26} color={t.colors.accent} />
        </View>
        <Text variant="display" style={{ marginTop: t.space.xl }}>
          Podshot
        </Text>
        <Text color="inkSoft" style={{ marginTop: t.space.sm, maxWidth: 320 }}>
          A daily progress photo, seen only by a few people who will notice when you skip.
        </Text>
      </Animated.View>

      <Animated.View layout={LinearTransition.springify().damping(20)} style={{ marginTop: t.space.xxxl }}>
        {step === 'name' ? (
          <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOut.duration(120)}>
            <Text variant="caption" color="inkSoft" eyebrow>
              Step 1 of 3
            </Text>
            <Text variant="heading" style={{ marginTop: 6 }}>
              What should your pod call you?
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={t.colors.inkFaint}
              autoCapitalize="words"
              maxLength={28}
              style={{
                marginTop: t.space.lg,
                backgroundColor: t.colors.surface,
                borderWidth: 1,
                borderColor: t.colors.border,
                borderRadius: t.radius.lg,
                paddingHorizontal: t.space.lg,
                paddingVertical: t.space.lg,
                color: t.colors.ink,
                fontFamily: t.type.bodyStrong.fontFamily,
                fontSize: 17,
              }}
            />
            <Button
              label="Continue"
              size="lg"
              disabled={name.trim().length < 2}
              onPress={() => setStep('pod')}
              style={{ marginTop: t.space.xl }}
            />
          </Animated.View>
        ) : null}

        {step === 'pod' ? (
          <Animated.View entering={FadeInDown.duration(320)} exiting={FadeOut.duration(120)}>
            <Text variant="caption" color="inkSoft" eyebrow>
              Step 2 of 3
            </Text>
            <Text variant="heading" style={{ marginTop: 6 }}>
              Start a pod, or join one
            </Text>
            <Text variant="caption" color="inkFaint" style={{ marginTop: 4 }}>
              3 to 8 people. Invite-only, never discoverable.
            </Text>

            <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.lg }}>
              <Text variant="label" color="inkSoft">
                NEW POD
              </Text>
              <TextInput
                value={podName}
                onChangeText={setPodName}
                placeholder="Gym friends"
                placeholderTextColor={t.colors.inkFaint}
                maxLength={24}
                style={{
                  marginTop: t.space.sm,
                  backgroundColor: t.colors.surfaceSunken,
                  borderRadius: t.radius.md,
                  paddingHorizontal: t.space.md,
                  paddingVertical: t.space.md,
                  color: t.colors.ink,
                  fontFamily: t.type.body.fontFamily,
                  fontSize: 16,
                }}
              />
              <View style={{ flexDirection: 'row', gap: t.space.sm, marginTop: t.space.md }}>
                {POD_EMOJI.map((e) => (
                  <Squish
                    key={e}
                    scaleTo={0.88}
                    onPress={() => setEmoji(e)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: emoji === e ? t.colors.accentSoft : t.colors.surfaceSunken,
                      borderWidth: emoji === e ? 1.5 : 0,
                      borderColor: t.colors.accent,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{e}</Text>
                  </Squish>
                ))}
              </View>
              <Button
                label="Create pod"
                loading={busy}
                onPress={() => void finish('create')}
                style={{ marginTop: t.space.lg }}
              />
            </Card>

            <Card padded="lg" radiusKey="xl" tint="surfaceAlt" level={0} style={{ marginTop: t.space.md }}>
              <Text variant="label" color="inkSoft">
                HAVE AN INVITE CODE
              </Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={t.colors.inkFaint}
                autoCapitalize="characters"
                maxLength={6}
                style={{
                  marginTop: t.space.sm,
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radius.md,
                  paddingHorizontal: t.space.md,
                  paddingVertical: t.space.md,
                  color: t.colors.ink,
                  fontFamily: t.type.title.fontFamily,
                  fontSize: 20,
                  letterSpacing: 4,
                }}
              />
              <Button
                label="Join pod"
                variant="secondary"
                loading={busy}
                disabled={code.length !== 6}
                onPress={() => void finish('join')}
                style={{ marginTop: t.space.md }}
              />
            </Card>

            {error ? (
              <Text variant="caption" color="accentInk" style={{ marginTop: t.space.md }}>
                {error}
              </Text>
            ) : null}

            <Button
              label="Skip - just track myself for now"
              variant="ghost"
              onPress={() => setStep('privacy')}
              style={{ marginTop: t.space.md }}
            />
          </Animated.View>
        ) : null}

        {step === 'privacy' ? (
          <Animated.View entering={FadeInDown.duration(320)}>
            <Text variant="caption" color="inkSoft" eyebrow>
              Step 3 of 3
            </Text>
            <Text variant="heading" style={{ marginTop: 6 }}>
              Your photos, your rules
            </Text>
            <Card padded="lg" radiusKey="xl" style={{ marginTop: t.space.lg, gap: t.space.md }}>
              {[
                ['lock-closed-outline', 'Photos are stored on this device only, by default.'],
                ['eye-off-outline', 'Face blur can be turned on globally in Settings.'],
                ['people-outline', 'Only your pod ever sees a check-in. There is no public feed.'],
              ].map(([icon, copy]) => (
                <View key={copy} style={{ flexDirection: 'row', gap: t.space.md, alignItems: 'flex-start' }}>
                  <Ionicons name={icon as never} size={18} color={t.colors.mint} style={{ marginTop: 2 }} />
                  <Text color="inkSoft" style={{ flex: 1 }}>
                    {copy}
                  </Text>
                </View>
              ))}
            </Card>
            <Button
              label="Start"
              size="lg"
              loading={busy}
              onPress={async () => {
                await setSetting('local_only', 1);
                await finish('solo');
              }}
              style={{ marginTop: t.space.xl }}
            />
            <Button
              label="Start with a demo pod"
              variant="ghost"
              onPress={() => void finish('demo')}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}
