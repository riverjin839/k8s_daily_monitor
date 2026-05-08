import { create } from 'zustand';

/**
 * 테마 모드.
 * - `light` / `dark` : 기본 라이트 / 다크 (Databricks-leaning).
 * - `system`        : OS 환경설정 따라가는 라이트/다크.
 * - `claude`        : Anthropic Claude 브랜드 톤 — 따뜻한 페이퍼 배경 + 큰 radius +
 *                     은은한 그림자 + 코랄(#D97757) accent. 데스크톱 도구라기보다
 *                     문서/노트 느낌의 분위기로 차분하게 보여주는 옵션.
 */
export type Theme = 'dark' | 'light' | 'system' | 'claude';

function getSystemPreference(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ALL_CLASSES = ['light', 'dark', 'claude'] as const;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // 기존 모드 클래스 제거
  for (const c of ALL_CLASSES) root.classList.remove(c);

  if (theme === 'claude') {
    root.classList.add('claude');
  } else {
    const resolved = theme === 'system' ? getSystemPreference() : theme;
    root.classList.add(resolved);
  }
  localStorage.setItem('k8s:theme', theme);
}

// Apply theme immediately on module load (before React renders)
const _stored = localStorage.getItem('k8s:theme');
const _initial: Theme = (
  _stored === 'dark' || _stored === 'light' || _stored === 'system' || _stored === 'claude'
    ? _stored
    : 'light'
);
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
