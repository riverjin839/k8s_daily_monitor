import { create } from 'zustand';

// 스토리지 키에 v2 suffix — 이전 저장값(기본 220) 을 무시하고 새 기본값(icon-only) 적용
const NAV_KEY = 'k8s:sidebar-width-v2';
const CLUSTER_KEY = 'k8s:cluster-sidebar-width';

export const NAV_DEFAULT = 64;        // 기본은 icon-only, hover 시 portal tooltip
export const NAV_MIN = 56;            // 아이콘만 보이는 최소
export const NAV_COLLAPSE_AT = 110;   // 이 이하 = icon-only 모드
export const NAV_MAX = 360;

export const CLUSTER_DEFAULT = 240;
export const CLUSTER_MIN = 180;
export const CLUSTER_MAX = 380;

function loadInt(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  } catch {
    return fallback;
  }
}

interface SidebarState {
  navWidth: number;
  setNavWidth: (w: number) => void;
  resetNav: () => void;

  clusterSidebarWidth: number;
  setClusterSidebarWidth: (w: number) => void;
  resetClusterSidebar: () => void;
}

export const useSidebarStore = create<SidebarState>()((set) => ({
  navWidth: loadInt(NAV_KEY, NAV_DEFAULT, NAV_MIN, NAV_MAX),
  setNavWidth: (w) => {
    const clamped = Math.max(NAV_MIN, Math.min(NAV_MAX, Math.round(w)));
    try { localStorage.setItem(NAV_KEY, String(clamped)); } catch { /* ignore */ }
    set({ navWidth: clamped });
  },
  resetNav: () => {
    try { localStorage.setItem(NAV_KEY, String(NAV_DEFAULT)); } catch { /* ignore */ }
    set({ navWidth: NAV_DEFAULT });
  },

  clusterSidebarWidth: loadInt(CLUSTER_KEY, CLUSTER_DEFAULT, CLUSTER_MIN, CLUSTER_MAX),
  setClusterSidebarWidth: (w) => {
    const clamped = Math.max(CLUSTER_MIN, Math.min(CLUSTER_MAX, Math.round(w)));
    try { localStorage.setItem(CLUSTER_KEY, String(clamped)); } catch { /* ignore */ }
    set({ clusterSidebarWidth: clamped });
  },
  resetClusterSidebar: () => {
    try { localStorage.setItem(CLUSTER_KEY, String(CLUSTER_DEFAULT)); } catch { /* ignore */ }
    set({ clusterSidebarWidth: CLUSTER_DEFAULT });
  },
}));
