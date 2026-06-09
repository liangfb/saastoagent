import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme_mode';

function readStoredMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * Resolve the actual rendered theme (light/dark) from the user's mode choice.
 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

export function applyTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // Hint the UA so native form controls / scrollbars match the chosen theme.
  root.style.colorScheme = theme;
}

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initialMode = readStoredMode();
  const initialResolved = resolveTheme(initialMode);

  // Keep "auto" mode in sync with OS-level changes.
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Only react when current mode is auto; explicit choices stay sticky.
      const current = useThemeStore.getState().mode;
      if (current !== 'auto') return;
      const resolved = mq.matches ? 'dark' : 'light';
      applyTheme(resolved);
      set({ resolved });
    };
    if ('addEventListener' in mq) mq.addEventListener('change', handler);
    else (mq as MediaQueryList).addListener(handler);
  }

  return {
    mode: initialMode,
    resolved: initialResolved,
    setMode: (mode) => {
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // ignore quota / privacy mode failures — UI still updates in-memory
      }
      const resolved = resolveTheme(mode);
      applyTheme(resolved);
      set({ mode, resolved });
    },
  };
});
