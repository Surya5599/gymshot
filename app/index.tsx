import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

/** Boot gate: waits for the database and the auth session, then routes to
 *  sign-in, onboarding, or the app. */
export default function Index() {
  const { ready, authReady, session, me } = useStore();
  const t = useTheme();

  if (!ready || !authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/auth" />;
  return <Redirect href={me ? '/(tabs)/today' : '/onboarding'} />;
}
