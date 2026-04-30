import { create } from 'zustand';

// 스토리지 키에 v2 suffix — 이전 저장값(기본 220) 을 무시하고 새 기본값(icon-only) 적용
const NAV_KEY = 'k8s:sidebar-width-v2';
const CLUSTER_KEY = 'k8s:cluster-sidebar-width';
const NAV_GROUPS_KEY = 'k8s:sidebar-collapsed-groups-v1';

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

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(NAV_GROUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    }
  } catch { /* ignore */ }
  // 기본값: 모든 그룹 접기 — 사용자가 그룹 제목만 보고 클릭해 펼치도록.
  return {
    monitoring: true,
    work: true,
    cluster: true,
    analysis: true,
    docs: true,
    system: true,
  };
}

interface SidebarState {
  navWidth: number;
  setNavWidth: (w: number) => void;
  resetNav: () => void;

  clusterSidebarWidth: number;
  setClusterSidebarWidth: (w: number) => void;
  resetClusterSidebar: () => void;

  /** 그룹 ID → 접힘 여부. true = 접힘(자식 항목 숨김). */
  collapsedGroups: Record<string, boolean>;
  toggleGroup: (id: string) => void;
  setGroupCollapsed: (id: string, collapsed: boolean) => void;
  collapseAllGroups: () => void;
  expandAllGroups: () => void;
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

  collapsedGroups: loadCollapsedGroups(),
  toggleGroup: (id) => set((s) => {
    const next = { ...s.collapsedGroups, [id]: !s.collapsedGroups[id] };
    try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { collapsedGroups: next };
  }),
  setGroupCollapsed: (id, collapsed) => set((s) => {
    const next = { ...s.collapsedGroups, [id]: collapsed };
    try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { collapsedGroups: next };
  }),
  collapseAllGroups: () => set(() => {
    const next = { monitoring: true, work: true, cluster: true, analysis: true, docs: true, system: true };
    try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { collapsedGroups: next };
  }),
  expandAllGroups: () => set(() => {
    const next = { monitoring: false, work: false, cluster: false, analysis: false, docs: false, system: false };
    try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { collapsedGroups: next };
  }),
}));
