import { useMutation } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { DayKey } from './date';

/**
 * Client-side shapes and the few helpers that are not a plain useQuery.
 * Everything else reads straight from Convex with useQuery, which is live:
 * a squad-mate posting, reacting, or nudging updates the screen by itself.
 */

export const ANGLES = ['front', 'side', 'back'] as const;
export type Angle = (typeof ANGLES)[number];

export const REACTIONS = ['\u{1F525}', '\u{1F44F}', '\u{1F4AA}', '\u{1F440}', '\u{1F60D}'] as const;

export type Profile = {
  id: Id<'users'>;
  email: string | null;
  displayName: string;
  shareTrained: boolean;
  blurFace: boolean;
  /** Pro until this instant (ms); null = never subscribed. */
  proUntil: number | null;
};

export function isPro(p: Pick<Profile, 'proUntil'> | null | undefined): boolean {
  return !!p?.proUntil && p.proUntil > Date.now();
}

/* ------------------------------------------------------------ photo links */

const EPOCH_MS = 12 * 60 * 60 * 1000;
const epochNow = () => Math.floor(Date.now() / EPOCH_MS);

/**
 * The 12-hour bucket photo links are minted for (see convex/lib/photoUrl.ts).
 * Stable within a bucket, so image URLs - and the browser's image cache -
 * stay stable; ticking over re-runs the queries and mints fresh links
 * before the old ones expire.
 */
export function useEpoch(): number {
  const [epoch, setEpoch] = useState(epochNow);
  useEffect(() => {
    const msLeft = (epoch + 1) * EPOCH_MS - Date.now();
    const t = window.setTimeout(() => setEpoch(epochNow()), Math.max(1000, msLeft + 1000));
    return () => window.clearTimeout(t);
  }, [epoch]);
  return epoch;
}

/* ----------------------------------------------------------------- upload */

/** Downscale to keep uploads phone-photo sized, not camera-raw sized. */
async function resizeToJpeg(file: Blob, maxDim = 1440): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not encode the photo.');
  return { blob, width, height };
}

/** Resize, upload straight to Convex storage, then attach to the day. */
export function useUploadPhoto(): (day: DayKey, angle: Angle, file: Blob) => Promise<void> {
  const generateUploadUrl = useMutation(api.checkins.generateUploadUrl);
  const savePhoto = useMutation(api.checkins.savePhoto);
  return useCallback(
    async (day, angle, file) => {
      const { blob, width, height } = await resizeToJpeg(file);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!res.ok) throw new Error('Upload failed. Check your connection and try again.');
      const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
      await savePhoto({ day, angle, storageId, width, height });
    },
    [generateUploadUrl, savePhoto]
  );
}

/** Convex errors arrive wrapped ("[CONVEX M(...)] Uncaught Error: ..."). */
export function errorText(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  const m = raw.match(/Uncaught (?:Error|AppError): (.*?)(?:\n|$)/);
  return (m?.[1] ?? raw).trim() || fallback;
}
