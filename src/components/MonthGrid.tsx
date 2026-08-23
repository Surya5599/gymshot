import React from 'react';
import { View } from 'react-native';

import { daysInMonth, fromDayKey, type DayKey } from '@/lib/date';
import { useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  /** Days that have a check-in, any order, any month. */
  logged: readonly DayKey[];
  /** The current day; fixes which month is drawn and where "future" starts. */
  today: DayKey;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The current month as a calendar of dots: filled means you posted that day,
 * hollow means you did not, and days that have not happened yet stay quiet.
 * A gap is meant to be visible - hiding it would defeat the accountability.
 */
export function MonthGrid({ logged, today }: Props) {
  const prefix = today.slice(0, 7); // YYYY-MM
  const total = daysInMonth(today);
  const todayNum = Number(today.slice(8));
  const leading = fromDayKey(`${prefix}-01`).getDay();

  const loggedSet = new Set(logged.filter((d) => d.startsWith(prefix)).map((d) => Number(d.slice(8))));

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w, i) => (
          <View key={`${w}-${i}`} style={{ width: `${100 / 7}%`, alignItems: 'center' }}>
            <Text variant="caption" color="inkFaint">
              {w}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
        {cells.map((day, i) => (
          <View key={i} style={{ width: `${100 / 7}%`, padding: 2 }}>
            {day === null ? (
              <View style={{ aspectRatio: 1 }} />
            ) : (
              <Cell day={day} posted={loggedSet.has(day)} isToday={day === todayNum} future={day > todayNum} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function Cell({ day, posted, isToday, future }: { day: number; posted: boolean; isToday: boolean; future: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        aspectRatio: 1,
        borderRadius: t.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: posted ? t.colors.accent : future ? 'transparent' : t.colors.surfaceSunken,
        borderWidth: isToday && !posted ? 1.5 : 0,
        borderColor: t.colors.accent,
        opacity: future ? 0.55 : 1,
      }}
    >
      <Text
        variant="caption"
        style={{
          color: posted ? t.colors.inkInverse : isToday ? t.colors.accentInk : t.colors.inkFaint,
          fontFamily: t.type.bodyStrong.fontFamily,
        }}
      >
        {day}
      </Text>
    </View>
  );
}
