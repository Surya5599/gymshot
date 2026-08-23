import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button, Screen, Text } from '@/components';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

type Mode = 'signin' | 'signup';

/** Email + password gate in front of onboarding. Session persists on-device,
 *  so this only appears once per install (or after signing out). */
export default function Auth() {
  const t = useTheme();
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail } = useStore();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 6;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email.trim(), password);
        router.replace('/');
      } else {
        const hasSession = await signUpWithEmail(email.trim(), password);
        if (hasSession) {
          router.replace('/');
        } else {
          setNotice('Check your email for a confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    marginTop: t.space.md,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.lg,
    color: t.colors.ink,
    fontFamily: t.type.bodyStrong.fontFamily,
    fontSize: 17,
  } as const;

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
          GymShot
        </Text>
        <Text color="inkSoft" style={{ marginTop: t.space.sm, maxWidth: 320 }}>
          {mode === 'signin'
            ? 'Welcome back. Sign in to pick up your streak.'
            : 'One account, so your pod knows it is really you.'}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(320).delay(80)} style={{ marginTop: t.space.xxxl }}>
        <Text variant="heading">{mode === 'signin' ? 'Sign in' : 'Create your account'}</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={t.colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={inputStyle}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (6+ characters)"
          placeholderTextColor={t.colors.inkFaint}
          autoCapitalize="none"
          secureTextEntry
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
          style={inputStyle}
        />

        {error ? (
          <Text variant="caption" color="accentInk" style={{ marginTop: t.space.md }}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text variant="caption" color="inkSoft" style={{ marginTop: t.space.md }}>
            {notice}
          </Text>
        ) : null}

        <Button
          label={mode === 'signin' ? 'Sign in' : 'Create account'}
          size="lg"
          loading={busy}
          disabled={!valid}
          onPress={() => void submit()}
          style={{ marginTop: t.space.xl }}
        />
        <Button
          label={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          variant="ghost"
          onPress={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setNotice(null);
          }}
          style={{ marginTop: t.space.md }}
        />
      </Animated.View>
    </Screen>
  );
}
