import { useMemo } from 'react';
import { useUiSettings } from './useUiSettings';
import {
  SERVICE_CATALOG as STATIC_CATALOG,
  type ServiceDef,
  colorBadgeClass,
} from '@/components/services/serviceCatalog';
import {
  Server, Lock, Box, Wrench, GitBranch, Activity, BarChart3, Network,
  Database, Eye, ArrowRightLeft, Container, MoreHorizontal,
  BookOpen, BookMarked, FileText, AlertTriangle, Clock, Link2,
  Layers, Settings, Cpu, HardDrive, ClipboardList, ListTodo, Users, type LucideIcon,
} from 'lucide-react';
import type { ServiceCatalogEntry } from '@/types';

/** lucide-react 아이콘 이름 → 컴포넌트 매핑.
 *  Settings 의 서비스 탭에서 string 으로 저장된 아이콘 이름을 React 컴포넌트로 변환. */
const ICON_MAP: Record<string, LucideIcon> = {
  Server, Lock, Box, Wrench, GitBranch, Activity, BarChart3, Network,
  Database, Eye, ArrowRightLeft, Container, MoreHorizontal,
  BookOpen, BookMarked, FileText, AlertTriangle, Clock, Link2,
  Layers, Settings, Cpu, HardDrive, ClipboardList, ListTodo, Users,
};

export const SERVICE_ICON_OPTIONS = Object.keys(ICON_MAP);

export function getServiceIcon(name?: string | null): LucideIcon {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return BookOpen;
}

/** ui_settings 의 사용자 정의 서비스 카탈로그를 우선, 비어있으면 static 폴백.
 *  ServiceDef 형태로 통일해 기존 페이지/컴포넌트 호환성 유지. */
export function useServiceCatalog(): ServiceDef[] {
  const { data: settings } = useUiSettings();
  return useMemo(() => {
    const items: ServiceCatalogEntry[] | undefined = settings?.serviceCatalog;
    if (!items || items.length === 0) {
      // 기본 카탈로그 (static).
      return STATIC_CATALOG;
    }
    const sorted = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return sorted.map((s) => ({
      key: s.slug,
      label: s.label,
      icon: getServiceIcon(s.icon),
      color: s.color || 'slate',
      description: s.description,
    }));
  }, [settings?.serviceCatalog]);
}

/** 카탈로그 항목 + 'other' fallback 조회. */
export function useGetServiceDef() {
  const catalog = useServiceCatalog();
  return useMemo(() => {
    const map = new Map(catalog.map((s) => [s.key, s]));
    return (key: string): ServiceDef => {
      const found = map.get(key);
      if (found) return found;
      const other = map.get('other');
      return other
        ? { ...other, key, label: key }
        : { key, label: key, icon: getServiceIcon('MoreHorizontal'), color: 'slate' };
    };
  }, [catalog]);
}

export { colorBadgeClass };
