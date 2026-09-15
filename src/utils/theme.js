// Runtime theme engine
// -----------------------------------------------------------------
// index.css defines the DEFAULT color values as CSS custom properties
// on :root, and Tailwind's `@theme inline` block turns them into utility
// classes (bg-primary, text-neutral-500, border-danger/20, ...).
//
// This module lets the user override those same custom properties at
// runtime (via document.documentElement.style.setProperty), and persists
// the chosen values in localStorage so the custom theme survives a
// page reload. Because every generated Tailwind utility resolves through
// var(--primary) etc. (never a literal hex value), overriding the
// variable here instantly re-themes every component that uses these
// classes — no rebuild, no per-component changes needed.
//
// A browser tab can't rewrite index.css on disk, so this is the
// standard/only way to build a "theme customizer" for a static
// Tailwind build: CSS variables + a runtime override layer.
// -----------------------------------------------------------------

const STORAGE_KEY = 'saec-theme';

// Must mirror the :root block in index.css exactly. This is what
// "Reset to Default" restores and what fills in any variable missing
// from an older saved theme.
export const DEFAULT_THEME = {
  // Brand
  primary: '#0056D2',
  secondary: '#F4F7FC',
  tertiary: '#F9BC15',
  quaternary: '#FE4A65',
  quinary: '#1A253C',

  // Neutral scale
  'neutral-50': '#F9FAFB',
  'neutral-100': '#F3F4F6',
  'neutral-200': '#E5E7EB',
  'neutral-300': '#D1D5DB',
  'neutral-400': '#9CA3AF',
  'neutral-500': '#6B7280',
  'neutral-600': '#4B5563',
  'neutral-700': '#374151',

  // Status
  danger: '#DC2626',
  warning: '#D97706',
  info: '#EA580C',
  success: '#059669',

  // Surface
  surface: '#FFFFFF',

  // Accents
  'accent-purple': '#9333EA',
  'accent-sky': '#0284C7',
  'accent-indigo': '#4F46E5',
  'accent-teal-dark': '#0f5c5c',
  'accent-teal': '#17a2a2',
  'accent-teal-light': '#eaf6f6',
};

// Grouped view of the same keys, purely for rendering organized sections
// in a theme-picker UI. Keep in sync with DEFAULT_THEME above.
export const THEME_GROUPS = [
  {
    label: 'Brand Colors',
    keys: ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'],
  },
  {
    label: 'Neutral Scale',
    keys: [
      'neutral-50', 'neutral-100', 'neutral-200', 'neutral-300',
      'neutral-400', 'neutral-500', 'neutral-600', 'neutral-700',
    ],
  },
  {
    label: 'Status Colors',
    keys: ['danger', 'warning', 'info', 'success'],
  },
  {
    label: 'Surface',
    keys: ['surface'],
  },
  {
    label: 'Accent Colors',
    keys: [
      'accent-purple', 'accent-sky', 'accent-indigo',
      'accent-teal-dark', 'accent-teal', 'accent-teal-light',
    ],
  },
];

/**
 * Push a full (or partial) theme object onto the document root as
 * CSS custom properties, e.g. { primary: '#123456' } -> --primary: #123456;
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    if (value) root.style.setProperty(`--${key}`, value);
  });
}

/**
 * Read the saved theme from localStorage, merged over DEFAULT_THEME so
 * any variable added later (or missing from an older save) still has a
 * valid value. Returns DEFAULT_THEME untouched if nothing is saved yet
 * or the saved value is corrupt.
 */
export function loadTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const saved = JSON.parse(raw);
    return { ...DEFAULT_THEME, ...saved };
  } catch (err) {
    console.error('Failed to parse saved theme, falling back to defaults:', err);
    return { ...DEFAULT_THEME };
  }
}

/** Persist a theme object to localStorage so it survives a reload. */
export function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
}

/**
 * Call this once, as early as possible during app boot (e.g. top of
 * main.jsx/App.jsx, before or during first render), to re-apply
 * whatever theme the user last saved. If nothing was saved, this is a
 * harmless no-op — the defaults already baked into index.css stand.
 */
export function initTheme() {
  const theme = loadTheme();
  applyTheme(theme);
  return theme;
}

/** Wipe the saved theme and restore the shipped defaults everywhere. */
export function resetTheme() {
  localStorage.removeItem(STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
  return { ...DEFAULT_THEME };
}