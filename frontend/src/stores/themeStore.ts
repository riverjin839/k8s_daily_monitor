import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';

function getSystemPreference(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemPreference() : theme;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
  localStorage.setItem('k8s:theme', theme);
}

// Apply theme immediately on module load (before React renders)
const _initial = (localStorage.getItem('k8s:theme') as Theme | null) ?? 'light';
applyTheme(_initial);

// Listen for system preference changes when theme is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const current = (localStorage.getItem('k8s:theme') as Theme | null) ?? 'light';
  if (current === 'system') applyTheme('system');
});

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: _initial,
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
