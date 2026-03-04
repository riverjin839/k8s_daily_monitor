import { create } from 'zustand';

export type Theme = 'dark' | 'light' | 'system';

function getSystemPreference(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemPreference() : theme;
  if (resolved === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
  localStorage.setItem('k8s:theme', theme);
}

// Apply theme immediately on module load (before React renders)
const _initial = (localStorage.getItem('k8s:theme') as Theme | null) ?? 'dark';
applyTheme(_initial);

// Listen for system preference changes when theme is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const current = (localStorage.getItem('k8s:theme') as Theme | null) ?? 'dark';
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
