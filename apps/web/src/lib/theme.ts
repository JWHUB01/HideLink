'use client';

import { useSyncExternalStore } from 'react';

/** The dark-scheme variants a user can pick in the settings. */
export type DarkShade = 'default' | 'green' | 'purple';

/**
 * The interface theme: light, dark, or whatever the operating system says — plus, for
 * the dark scheme, an optional *shade* (green or purple) chosen in the settings.
 *
 * ## Why this is not React state
 *
 * The theme is an *external system*: the class on `<html>` is what actually paints the
 * page, and a second copy of the value inside a component could disagree with it. It is
 * kept in a module-level store and read with `useSyncExternalStore`, the same shape as
 * `use-ticker.ts`, which also sidesteps the React 19 rule against writing state from an
 * effect body.
 *
 * ## What the header button does
 *
 * `null` means "nobody has chosen": the operating system decides, and it keeps deciding
 * if the user never touches the switch. Pressing the switch stores an explicit `light` or
 * `dark`, after which the system preference is ignored — a user who picked a theme does
 * not want it changed under them at sunset. The button never changes the shade; the shade
 * only exists in the settings and only applies while the scheme is dark.
 *
 * ## Why the first paint is already correct
 *
 * `layout.tsx` runs a tiny inline script before the body renders, so the class is set
 * before anything is painted. Without it, a dark-theme user would see a flash of white on
 * every navigation. This module and that script must agree on the storage keys and the
 * class names; both are defined here and the script only repeats the literal.
 */

export type Theme = 'light' | 'dark';

/** Must match the key used by the inline script in `layout.tsx`. */
export const THEME_STORAGE_KEY = 'anonlink.theme';

/** Must match the key used by the inline script in `layout.tsx`. */
export const DARK_SHADE_STORAGE_KEY = 'anonlink.dark-shade';

/** Must match the class toggled by the inline script in `layout.tsx`. */
export const DARK_CLASS = 'dark';

export const DARK_SHADE_CLASSES: Record<DarkShade, string> = {
  default: '',
  green: 'dark-green',
  purple: 'dark-purple',
};

const listeners = new Set<() => void>();

/** `null` until resolved; also what tells us the store has been read at least once. */
let cached: Theme | null = null;
let cachedShade: DarkShade = 'default';
let mediaQuery: MediaQueryList | null = null;

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The user's stored choice, when it is readable.
 *
 * Reading `localStorage` can throw: some browsers refuse it in a partitioned or
 * third-party context, and the theme must not become a reason the app does not boot.
 */
export function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

/** The user's stored dark shade, `'default'` when nothing is stored or it is not dark. */
export function readStoredDarkShade(): DarkShade {
  if (typeof window === 'undefined') return 'default';

  try {
    const stored = window.localStorage.getItem(DARK_SHADE_STORAGE_KEY);
    return stored === 'green' || stored === 'purple' ? stored : 'default';
  } catch {
    return 'default';
  }
}

/** Paints a theme. The only place the DOM is touched. */
export function applyTheme(theme: Theme, shade: DarkShade = cachedShade): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, theme === 'dark');
  // The shade only exists while the scheme is dark; in light mode the classes are
  // removed so a diffuse stylesheet cannot leak a tint into the light page.
  for (const value of ['green', 'purple'] as const) {
    root.classList.toggle(DARK_SHADE_CLASSES[value], theme === 'dark' && shade === value);
  }
  // Keeps native widgets (scrollbars, form controls) in step with the page.
  root.style.colorScheme = theme;
}

function currentTheme(): Theme {
  if (cached === null) cached = readStoredTheme() ?? systemTheme();
  return cached;
}

function currentShade(): DarkShade {
  return cachedShade;
}

/** Switches the theme, remembers the choice and repaints. */
export function setTheme(theme: Theme): void {
  cached = theme;
  applyTheme(theme);

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A refused write means the choice lasts for this page view only. Still better than
    // throwing and leaving the page half-updated.
  }

  for (const listener of [...listeners]) listener();
}

/** Switches the dark shade, remembers the choice and repaints. */
export function setDarkShade(shade: DarkShade): void {
  cachedShade = shade;
  applyTheme(currentTheme(), shade);

  try {
    window.localStorage.setItem(DARK_SHADE_STORAGE_KEY, shade);
  } catch {
    // Same fallback as `setTheme`: a refused write only costs this page view.
  }

  for (const listener of [...listeners]) listener();
}

function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);

  if (mediaQuery === null && typeof window !== 'undefined') {
    // Attached once, for the lifetime of the page, and only useful while nothing has been
    // chosen: after an explicit choice the system preference is deliberately ignored, and
    // following it would fight the user. A system theme change matters only when the user
    // is *following* the system.
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', () => {
      if (readStoredTheme() !== null) return;
      const next = query.matches ? 'dark' : 'light';
      if (next === cached) return;
      cached = next;
      applyTheme(next);
      for (const current of [...listeners]) current();
    });
    mediaQuery = query;
  }

  return () => {
    // The subscription set only decides *who is told*; the media listener above is
    // deliberately permanent, so a component that unmounts and remounts (a dialog, a
    // route change) does not detach and re-attach it and lose an event in between.
    listeners.delete(listener);
  };
}

const getServerSnapshot = (): Theme => 'light';

const getServerShadeSnapshot = (): DarkShade => 'default';

/**
 * The current theme, and a way to change it.
 *
 * The server snapshot is a constant: the server has no idea what the user prefers, and
 * the inline script has already painted the right colours. React re-reads the client
 * value immediately after hydration.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  // `subscribeTheme` is a module-level function, so it is already stable across renders —
  // wrapping it in a callback would only add a dependency to explain.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, getServerSnapshot);

  return [theme, setTheme];
}

/** The current dark shade and its setter. Mirrors `useTheme`'s store shape. */
export function useDarkShade(): [DarkShade, (shade: DarkShade) => void] {
  const shade = useSyncExternalStore(subscribeTheme, currentShade, getServerShadeSnapshot);

  return [shade, setDarkShade];
}