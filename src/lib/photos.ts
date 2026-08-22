import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Angle } from '@/db/types';
import type { DayKey } from './date';
import { newId } from './id';

/**
 * Photos live in the app's own document directory, never the shared camera
 * roll, so they are excluded from other apps and removed with the app. The
 * capture flow hands us a temporary cache uri; we downscale it and move it
 * here under a stable name.
 */
const ROOT = 'checkins';

function checkinsDir(): Directory {
  const dir = new Directory(Paths.document, ROOT);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Long edge cap. 1440 keeps detail for pinch-zoom while staying under ~400KB. */
const MAX_EDGE = 1440;

export type StoredPhoto = { uri: string; width: number; height: number };

export async function storeCheckInPhoto(
  sourceUri: string,
  day: DayKey,
  angle: Angle,
  sourceWidth?: number,
  sourceHeight?: number
): Promise<StoredPhoto> {
  const portrait = (sourceHeight ?? 1) >= (sourceWidth ?? 0);
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize(portrait ? { height: MAX_EDGE } : { width: MAX_EDGE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });

  const dir = checkinsDir();
  const target = new File(dir, `${day}_${angle}_${newId()}.jpg`);
  const temp = new File(saved.uri);
  temp.move(target);

  return { uri: target.uri, width: saved.width, height: saved.height };
}

/** Removes a stored file, tolerating an already-missing one. */
export function deleteStoredPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing file is the desired end state either way.
  }
}

/** Total bytes under the check-in directory, for the storage row in Settings. */
export function storageFootprint(): { files: number; bytes: number } {
  try {
    const entries = checkinsDir().list();
    let bytes = 0;
    let files = 0;
    for (const entry of entries) {
      if (entry instanceof File) {
        files++;
        bytes += entry.size ?? 0;
      }
    }
    return { files, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
