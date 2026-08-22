import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { avatarHues, Colors, motion, palette, radius, space, type } from './tokens';

type Theme = {
  scheme: 'light' | 'dark';
  colors: Colors;
  space: typeof space;
  radius: typeof radius;
  type: typeof type;
  motion: typeof motion;
  /** Layered soft shadow. iOS gets the real thing, Android gets elevation. */
  shadow: (level: 1 | 2 | 3) => object;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const scheme: 'light' | 'dark' = system === 'dark' ? 'dark' : 'light';

  const value = useMemo<Theme>(() => {
    const colors = palette[scheme] as unknown as Colors;
    return {
      scheme,
      colors,
      space,
      radius,
      type,
      motion,
      shadow: (level) => {
        const spec = {
          1: { radius: 10, y: 3, opacity: scheme === 'dark' ? 0.4 : 0.07, elevation: 2 },
          2: { radius: 22, y: 8, opacity: scheme === 'dark' ? 0.5 : 0.1, elevation: 6 },
          3: { radius: 38, y: 16, opacity: scheme === 'dark' ? 0.6 : 0.14, elevation: 12 },
        }[level];
        return {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: spec.y },
          shadowOpacity: spec.opacity,
          shadowRadius: spec.radius,
          elevation: spec.elevation,
        };
      },
    };
  }, [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Stable hue pair for a user id, so the same person is always the same color. */
export function hueFor(id: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return avatarHues[h % avatarHues.length] as readonly [string, string];
}
