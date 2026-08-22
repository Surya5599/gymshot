import { Ionicons } from '@expo/vector-icons';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Segmented, Squish, Text } from '@/components';
import { latestPhotoAtAngle } from '@/db/queries';
import { ANGLES, type Angle } from '@/db/types';
import { formatDay } from '@/lib/date';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

const { width: SCREEN_W } = Dimensions.get('window');

/** Off, then the three delays that matter: prop-the-phone, walk-back, re-pose. */
const TIMER_OPTIONS = [0, 3, 5, 10] as const;

export default function CaptureScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { me, settings, setSetting, saveTodayPhoto } = useStore();
  const params = useLocalSearchParams<{ angle?: string }>();

  const [angle, setAngle] = useState<Angle>(
    ANGLES.includes(params.angle as Angle) ? (params.angle as Angle) : 'front'
  );
  const [facing, setFacing] = useState<CameraType>('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [ghost, setGhost] = useState<{ uri: string; day: string } | null>(null);
  const [shot, setShot] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const timer = settings.timer_seconds ?? 0;
  const ghostOpacity = useSharedValue(0.4);

  /* The alignment reference: my most recent photo at this same angle. */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!me) return;
      const prev = await latestPhotoAtAngle(db, me.id, angle);
      if (alive) setGhost(prev?.uri ? { uri: prev.uri, day: prev.day } : null);
    })();
    return () => {
      alive = false;
    };
  }, [db, me, angle]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const take = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;
    const picture = await cam.takePictureAsync({ quality: 0.92, skipProcessing: false });
    if (picture) setShot({ uri: picture.uri, width: picture.width, height: picture.height });
  }, []);

  /**
   * Self-timer. Ticks once per second with a haptic so you can feel the count
   * without looking at the screen - the whole point is that the phone is
   * propped up across the room while you get into position.
   */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void take();
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(
        countdown <= 3 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light
      );
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, take]);

  const onShutter = useCallback(() => {
    if (countdown !== null) {
      setCountdown(null); // second tap cancels
      return;
    }
    if (timer > 0) setCountdown(timer);
    else void take();
  }, [countdown, timer, take]);

  const confirm = useCallback(async () => {
    if (!shot) return;
    setSaving(true);
    try {
      await saveTodayPhoto({ uri: shot.uri, angle, width: shot.width, height: shot.height });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [shot, angle, saveTodayPhoto, router]);

  const cycleTimer = useCallback(() => {
    const next = TIMER_OPTIONS[(TIMER_OPTIONS.indexOf(timer as 0) + 1) % TIMER_OPTIONS.length];
    void setSetting('timer_seconds', next);
  }, [timer, setSetting]);

  const ghostStyle = useAnimatedStyle(() => ({ opacity: ghostOpacity.value }));

  if (!permission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return <PermissionGate onRequest={requestPermission} onClose={() => router.back()} />;
  }

  const counting = countdown !== null;

  return (
    <View style={[styles.fill, { backgroundColor: '#000' }]}>
      {shot ? (
        <Image source={{ uri: shot.uri }} style={styles.fill} contentFit="cover" />
      ) : (
        <CameraView
          ref={cameraRef}
          style={styles.fill}
          facing={facing}
          mode="picture"
          animateShutter={false}
          mirror={facing === 'front'}
        />
      )}

      {/* Ghost overlay of the previous shot at this angle. */}
      {!shot && ghost ? (
        <Animated.View style={[StyleSheet.absoluteFill, ghostStyle]} pointerEvents="none">
          <Image source={{ uri: ghost.uri }} style={styles.fill} contentFit="cover" />
        </Animated.View>
      ) : null}

      {!shot && showGrid ? <AlignmentGrid /> : null}

      {/* Countdown fills the screen and swallows taps, so anywhere cancels. */}
      {counting ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setCountdown(null)}>
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(140)}
            style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.28)' }]}
          >
            <Animated.Text
              key={countdown}
              entering={ZoomIn.springify().damping(12)}
              exiting={ZoomOut.duration(180)}
              style={styles.countdownNumeral}
            >
              {countdown}
            </Animated.Text>
            <Text variant="label" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>
              tap to cancel
            </Text>
          </Animated.View>
        </Pressable>
      ) : null}

      <TopBar
        angle={angle}
        onAngle={setAngle}
        onClose={() => router.back()}
        disabled={!!shot || counting}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
        timer={timer}
        onCycleTimer={cycleTimer}
      />

      <BottomBar
        hasGhost={!!ghost}
        ghostDay={ghost?.day}
        ghostOpacity={ghostOpacity}
        shot={!!shot}
        saving={saving}
        counting={counting}
        timer={timer}
        onShutter={onShutter}
        onFlip={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
        onRetake={() => setShot(null)}
        onConfirm={confirm}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ pieces */

function PermissionGate({ onRequest, onClose }: { onRequest: () => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: t.colors.bg, padding: t.space.xxl }]}>
      <Ionicons name="camera-outline" size={40} color={t.colors.inkFaint} />
      <Text variant="heading" center style={{ marginTop: t.space.lg }}>
        Camera access needed
      </Text>
      <Text color="inkSoft" center style={{ marginTop: t.space.sm }}>
        Podshot only opens the camera when you are taking today's photo. Photos stay in the app's own
        storage.
      </Text>
      <Button label="Allow camera" onPress={onRequest} style={{ marginTop: t.space.xl }} />
      <Button label="Not now" variant="ghost" onPress={onClose} />
    </View>
  );
}

/** Thirds grid plus a centre plumb line - enough to stand consistently. */
function AlignmentGrid() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {[1, 2].map((i) => (
        <View
          key={`h${i}`}
          style={{
            position: 'absolute',
            top: `${(i * 100) / 3}%`,
            left: 0,
            right: 0,
            height: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255,255,255,0.28)',
          }}
        />
      ))}
      {[1, 2].map((i) => (
        <View
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: `${(i * 100) / 3}%`,
            top: 0,
            bottom: 0,
            width: StyleSheet.hairlineWidth,
            backgroundColor: 'rgba(255,255,255,0.28)',
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: 'rgba(255,255,255,0.45)',
        }}
      />
    </View>
  );
}

function TopBar({
  angle,
  onAngle,
  onClose,
  disabled,
  showGrid,
  onToggleGrid,
  timer,
  onCycleTimer,
}: {
  angle: Angle;
  onAngle: (a: Angle) => void;
  onClose: () => void;
  disabled: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  timer: number;
  onCycleTimer: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: insets.top + t.space.sm, left: t.space.lg, right: t.space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <GlassButton icon="close" onPress={onClose} />
        {!disabled ? (
          <View style={{ flex: 1, marginHorizontal: t.space.md, opacity: 0.96 }}>
            <Segmented
              options={ANGLES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
              value={angle}
              onChange={onAngle}
            />
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={{ flexDirection: 'row', gap: t.space.sm }}>
          <TimerButton seconds={timer} onPress={onCycleTimer} />
          <GlassButton icon={showGrid ? 'grid' : 'grid-outline'} onPress={onToggleGrid} />
        </View>
      </View>
    </View>
  );
}

/** Cycles off -> 3s -> 5s -> 10s. Active state is coral so it is obvious it is armed. */
function TimerButton({ seconds, onPress }: { seconds: number; onPress: () => void }) {
  const t = useTheme();
  const armed = seconds > 0;
  return (
    <Squish
      scaleTo={0.88}
      onPress={onPress}
      style={{
        minWidth: 40,
        height: 40,
        paddingHorizontal: armed ? 10 : 0,
        borderRadius: 20,
        backgroundColor: armed ? t.colors.accent : 'rgba(0,0,0,0.42)',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 3,
      }}
    >
      <Ionicons name={armed ? 'timer' : 'timer-outline'} size={17} color="#fff" />
      {armed ? (
        <Text variant="label" style={{ color: '#fff', fontSize: 12 }}>
          {seconds}s
        </Text>
      ) : null}
    </Squish>
  );
}

function GlassButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Squish
      scaleTo={0.88}
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.42)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={19} color="#fff" />
    </Squish>
  );
}

function BottomBar({
  hasGhost,
  ghostDay,
  ghostOpacity,
  shot,
  saving,
  counting,
  timer,
  onShutter,
  onFlip,
  onRetake,
  onConfirm,
}: {
  hasGhost: boolean;
  ghostDay?: string;
  ghostOpacity: ReturnType<typeof useSharedValue<number>>;
  shot: boolean;
  saving: boolean;
  counting: boolean;
  timer: number;
  onShutter: () => void;
  onFlip: () => void;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom + t.space.xl,
        paddingHorizontal: t.space.xl,
        gap: t.space.lg,
      }}
    >
      {!shot && hasGhost && !counting ? (
        <Animated.View entering={FadeIn}>
          <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>
            Aligning to {ghostDay ? formatDay(ghostDay) : 'your last photo'}
          </Text>
          <GhostSlider value={ghostOpacity} />
        </Animated.View>
      ) : null}

      {shot ? (
        <View style={{ flexDirection: 'row', gap: t.space.md }}>
          <View style={{ flex: 1 }}>
            <Button label="Retake" variant="secondary" icon="refresh" onPress={onRetake} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button label="Use photo" icon="checkmark" loading={saving} onPress={onConfirm} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ width: 48 }} />
          <Shutter onPress={onShutter} counting={counting} armed={timer > 0} />
          {!counting ? <GlassButton icon="camera-reverse-outline" onPress={onFlip} /> : <View style={{ width: 40 }} />}
        </View>
      )}
    </View>
  );
}

function Shutter({
  onPress,
  counting,
  armed,
}: {
  onPress: () => void;
  counting: boolean;
  armed: boolean;
}) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const ring = useSharedValue(1);

  const inner = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const outer = useAnimatedStyle(() => ({ transform: [{ scale: ring.value }] }));

  const tap = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.86, { damping: 16, stiffness: 300 });
      ring.value = withSpring(1.08, { damping: 16, stiffness: 300 });
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      ring.value = withSpring(1, { damping: 10, stiffness: 200 });
    })
    .onEnd(() => {
      runOnJS(onPress)();
    });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[
          outer,
          {
            width: 84,
            height: 84,
            borderRadius: 42,
            borderWidth: 3,
            borderColor: counting ? t.colors.accent : 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Animated.View
          style={[
            inner,
            {
              width: 66,
              height: 66,
              borderRadius: counting ? 18 : 33,
              backgroundColor: counting ? t.colors.accent : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          {counting ? (
            <Ionicons name="stop" size={22} color="#fff" />
          ) : armed ? (
            <Ionicons name="timer-outline" size={22} color="rgba(0,0,0,0.45)" />
          ) : null}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Ghost-opacity slider. Hand-rolled rather than pulling in a slider dependency,
 * and it runs entirely on the UI thread so dragging never stutters the preview.
 */
function GhostSlider({ value }: { value: ReturnType<typeof useSharedValue<number>> }) {
  const trackWidth = SCREEN_W - 40;
  const x = useSharedValue(value.value * trackWidth);

  const pan = Gesture.Pan()
    .onChange((e) => {
      const next = Math.min(trackWidth, Math.max(0, x.value + e.changeX));
      x.value = next;
      value.value = next / trackWidth;
    })
    .onEnd(() => {
      value.value = withTiming(value.value, { duration: 60 });
    });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 11 }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value }));

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: 34, justifyContent: 'center' }}>
        <View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.28)',
            width: trackWidth,
          }}
        />
        <Animated.View
          style={[
            fill,
            {
              position: 'absolute',
              height: 5,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.85)',
            },
          ]}
        />
        <Animated.View
          style={[
            knob,
            {
              position: 'absolute',
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#fff',
              ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
            },
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  countdownNumeral: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 132,
    lineHeight: 140,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 24,
  },
});
