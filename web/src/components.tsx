import React from 'react';

import type { DayKey } from './lib/date';
import { daysInMonth, fromDayKey } from './lib/date';

/** Seeded avatar color, same spirit as the mobile Avatar. */
export function Avatar({ id, name, size = 34 }: { id: string; name: string; size?: number }) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 55%)`, fontSize: size * 0.42 }}
      title={name}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on}>
      <div className="knob" />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The current month as a calendar: filled days posted, hollow days did not. */
export function MonthGrid({ logged, today }: { logged: readonly DayKey[]; today: DayKey }) {
  const prefix = today.slice(0, 7);
  const total = daysInMonth(today);
  const todayNum = Number(today.slice(8));
  const leading = fromDayKey(`${prefix}-01`).getDay();
  const loggedSet = new Set(logged.filter((d) => d.startsWith(prefix)).map((d) => Number(d.slice(8))));

  return (
    <div className="monthgrid">
      {WEEKDAYS.map((w, i) => (
        <div key={`${w}-${i}`} className="wd">
          {w}
        </div>
      ))}
      {Array.from({ length: leading }, (_, i) => (
        <div key={`b${i}`} className="cell blank" />
      ))}
      {Array.from({ length: total }, (_, i) => {
        const day = i + 1;
        const cls = [
          'cell',
          loggedSet.has(day) ? 'posted' : '',
          day === todayNum && !loggedSet.has(day) ? 'today' : '',
          day > todayNum ? 'future' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={day} className={cls}>
            {day}
          </div>
        );
      })}
    </div>
  );
}
