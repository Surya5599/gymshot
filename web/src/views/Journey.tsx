import React, { useEffect, useState } from 'react';

import { Segmented } from '../components';
import { ANGLES, myTimeline, signPhotoUrls, type Angle } from '../lib/api';
import { formatDay, monthName, type DayKey } from '../lib/date';

type Frame = { day: DayKey; path: string; url: string | null };

export default function JourneyView({ active }: { active: boolean }) {
  const [angle, setAngle] = useState<Angle>('front');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      const rows = await myTimeline(angle);
      const urls = await signPhotoUrls(rows.map((r) => r.path));
      if (cancelled) return;
      setFrames(rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null })));
      setLoaded(true);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [angle, active]);

  const byMonth = new Map<string, Frame[]>();
  for (const f of frames) {
    const key = f.day.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), f]);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Journey</h1>
        <p className="caption" style={{ marginTop: 2 }}>
          Your own history. Nobody in your squads can scroll this.
        </p>
      </div>

      <Segmented
        options={ANGLES.map((a) => ({ value: a, label: a[0].toUpperCase() + a.slice(1) }))}
        value={angle}
        onChange={setAngle}
      />

      {loaded && frames.length === 0 ? (
        <p className="notice" style={{ textAlign: 'center', marginTop: 24 }}>
          No {angle} photos yet. Every photo you post at this angle lands here, oldest first.
        </p>
      ) : null}

      {months.map(([month, monthFrames]) => (
        <div key={month}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            {monthName(`${month}-01`)}
          </p>
          <div className="photo-grid">
            {monthFrames.map((f) =>
              f.url ? (
                <div key={f.path + f.day} style={{ position: 'relative' }}>
                  <img src={f.url} alt={f.day} loading="lazy" decoding="async" />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      left: 6,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '1px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {formatDay(f.day)}
                  </span>
                </div>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
