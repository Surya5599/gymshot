import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Segmented, Squish, Text } from '@/components';
import type { Photo } from '@/db/types';
import { ANGLES, type Angle } from '@/db/types';
import { DayKey, formatDay } from '@/lib/date';
import { useStore } from '@/state/AppStore';
import { useTheme } from '@/theme';

type Frame = Photo & { day: DayKey };

const SPEEDS = [
  { value: '4', label: '4 fps' },
  { value: '8', label: '8 fps' },
  { value: '14', label: '14 fps' },
] as const;

/**
 * Every frame is drawn into the same fixed rect regardless of its own aspect
 * ratio. Without this the playback jitters as the frame box resizes, which is
 * exactly what a timelapse must not do.
 */
const FRAME_RATIO = 0.75;

/** Past this many frames, discrete ticks are thinner than the gaps between them. */
const MAX_DISCRETE_TICKS = 24;

/**
 * Timelapse playback.
 *
 * Frames are played in-app rather than encoded to mp4: video encoding needs a
 * native encoder (ffmpeg-kit or a Skia/GL pipeline) that is not available in
 * the managed runtime. Saving the frames to a Photos album is real today and
 * gives the same shareable artifact; mp4 export lands with the dev build.
 */
export default function TimelapseScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { timeline, settings } = useStore();
  const params = useLocalSearchParams<{ angle?: string; from?: string }>();

  const angle: Angle = ANGLES.includes(params.angle as Angle) ? (params.angle as Angle) : 'front';

  const [frames, setFrames] = useState<Frame[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState<string>('8');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await timeline(angle);
      if (!alive) return;
      setFrames(all);
      const start = params.from ? all.findIndex((f) => f.day === params.from) : 0;
      setIndex(start > 0 ? start : 0);
    })();
    return () => {
      alive = false;
    };
  }, [timeline, angle, params.from]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || frames.length < 2) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, 1000 / Number(fps));
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, fps, frames.length]);

  const saveFrames = useCallback(async () => {
    setExporting(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) return;
      let saved = 0;
      let album = await MediaLibrary.getAlbumAsync('GymShot');
      for (const frame of frames) {
        if (!frame.uri) continue;
        const asset = await MediaLibrary.createAssetAsync(frame.uri);
        if (!album) album = await MediaLibrary.createAlbumAsync('GymShot', asset, false);
        else await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        saved++;
      }
      setExported(saved);
    } finally {
      setExporting(false);
    }
  }, [frames]);

  const scrubTo = useCallback(
    (next: number) => {
      setPlaying(false);
      setIndex(next);
    },
    []
  );

  const current = frames[index];

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0A0A' }}>
      {/* Fixed frame box - every photo lands in the identical rect. */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {frames.length === 0 ? (
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>No photos at this angle yet</Text>
        ) : current?.uri ? (
          <View
            style={{
              width: '92%',
              aspectRatio: FRAME_RATIO,
              borderRadius: t.radius.lg,
              overflow: 'hidden',
              backgroundColor: '#141212',
            }}
          >
            <Image
              source={{ uri: current.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
              blurRadius={settings.blur_face === 1 ? 24 : 0}
            />
          </View>
        ) : (
          <ActivityIndicator color="#fff" />
        )}
      </View>

      <View style={{ position: 'absolute', top: insets.top + t.space.sm, left: t.space.lg, right: t.space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Squish
            scaleTo={0.88}
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={19} color="#fff" />
          </Squish>
          {current ? (
            <Animated.View
              key={current.day}
              entering={FadeIn.duration(120)}
              style={{
                paddingHorizontal: t.space.md,
                paddingVertical: 7,
                borderRadius: t.radius.pill,
                backgroundColor: 'rgba(0,0,0,0.45)',
              }}
            >
              <Text variant="label" style={{ color: '#fff' }}>
                {formatDay(current.day)}
              </Text>
            </Animated.View>
          ) : null}
          <View
            style={{
              minWidth: 40,
              paddingHorizontal: 10,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11 }}>
              {frames.length ? `${index + 1}/${frames.length}` : '0'}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.space.xl,
          paddingBottom: insets.bottom + t.space.xl,
          gap: t.space.md,
        }}
      >
        <ScrubTrack count={frames.length} index={index} onScrub={scrubTo} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
          <Squish
            scaleTo={0.9}
            onPress={() => setPlaying((p) => !p)}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#111" />
          </Squish>
          <View style={{ flex: 1 }}>
            <Segmented
              options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))}
              value={fps}
              onChange={setFps}
            />
          </View>
        </View>

        <Button
          label={exported != null ? `Saved ${exported} to Photos` : 'Save frames to Photos'}
          variant="secondary"
          icon={exported != null ? 'checkmark' : 'download-outline'}
          loading={exporting}
          disabled={frames.length === 0}
          onPress={() => void saveFrames()}
        />
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
          Video export needs a native encoder and arrives with the standalone build.
        </Text>
      </View>
    </View>
  );
}

/**
 * Scrub track. Under 24 frames it draws one tick per frame, which reads as
 * "these are the days". Above that, ticks would be thinner than their own gaps,
 * so it becomes a continuous bar with a progress fill. Either form is draggable
 * and tappable, and dragging pauses playback.
 */
function ScrubTrack({
  count,
  index,
  onScrub,
}: {
  count: number;
  index: number;
  onScrub: (next: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const lastEmitted = useSharedValue(-1);
  const trackWidth = useSharedValue(0);
  const total = useSharedValue(0);

  React.useEffect(() => {
    trackWidth.value = width;
    total.value = count;
  }, [width, count, trackWidth, total]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const emit = (x: number) => {
    'worklet';
    if (trackWidth.value <= 0 || total.value <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth.value));
    const next = Math.min(total.value - 1, Math.floor(ratio * total.value));
    if (next !== lastEmitted.value) {
      lastEmitted.value = next;
      runOnJS(onScrub)(next);
    }
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => emit(e.x))
    .onUpdate((e) => emit(e.x))
    .onFinalize(() => {
      lastEmitted.value = -1;
    });

  const tap = Gesture.Tap().onEnd((e) => emit(e.x));
  const gesture = Gesture.Race(pan, tap);

  const progress = count > 1 ? (index + 1) / count : 1;
  const discrete = count > 0 && count <= MAX_DISCRETE_TICKS;

  return (
    <GestureDetector gesture={gesture}>
      {/* Generous hit slop: the visual track is 5px, the touch target is 30. */}
      <View onLayout={onLayout} style={{ height: 30, justifyContent: 'center' }}>
        {discrete ? (
          <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
            {Array.from({ length: count }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  borderRadius: 3,
                  backgroundColor: i <= index ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.22)',
                }}
              />
            ))}
          </View>
        ) : (
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.22)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: 6,
                borderRadius: 3,
                width: `${progress * 100}%`,
                backgroundColor: 'rgba(255,255,255,0.95)',
              }}
            />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
