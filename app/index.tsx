import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

/** Boot gate: waits for the database, then routes to onboarding or the app. */
export default function Index() {
  const { ready, me } = useStore();
  const t = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bg }}>
        <ActivityIndicator color={t.colors.accent} />
      </View>
    );
  }

  return <Redirect href={me ? '/(tabs)/today' : '/onboarding'} />;
}
