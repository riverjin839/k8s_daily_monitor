import {
  Server, Database, Cloud, CloudCog, Shield, Cpu, HardDrive, Network, Globe,
  Box, Boxes, Layers, Workflow, Activity, Zap, Rocket, Flame, Atom, Container,
  Wrench, Settings2, Anchor, Cog, Hexagon, Component,
  type LucideIcon,
} from 'lucide-react';

/** 사용자가 클러스터 사이드바에서 선택할 수 있는 lucide-react 아이콘 화이트리스트.
 *  키는 lucide-react 컴포넌트 이름 그대로 사용 (Cluster.icon 에 저장되는 값과 동일). */
export const CLUSTER_ICON_OPTIONS: Record<string, LucideIcon> = {
  Server,
  Database,
  Cloud,
  CloudCog,
  Shield,
  Cpu,
  HardDrive,
  Network,
  Globe,
  Box,
  Boxes,
  Layers,
  Workflow,
  Activity,
  Zap,
  Rocket,
  Flame,
  Atom,
  Container,
  Wrench,
  Settings2,
  Anchor,
  Cog,
  Hexagon,
  Component,
};

/** UI 에서 자주 쓰일만한 emoji 추천 목록 — 사용자는 임의 emoji 도 직접 입력 가능. */
export const CLUSTER_EMOJI_SUGGESTIONS = [
  '🚀', '☸️', '🛡️', '🔥', '⚡', '💾', '🗄️', '🌐', '🛰️', '🪐',
  '🧪', '🧱', '🧊', '🟦', '🟩', '🟧', '🟥', '🟨', '🟪', '⭐',
  '🐳', '☁️', '🔧', '🛠️', '📦', '🧠', '🤖', '🎯', '🏷️', '🔐',
] as const;

export type ResolvedClusterIcon =
  | { kind: 'lucide'; Component: LucideIcon }
  | { kind: 'text'; value: string }
  | null;

/** Cluster.icon 값을 사이드바에서 어떻게 렌더할지 결정.
 *  - 화이트리스트의 lucide 컴포넌트 이름 → lucide 컴포넌트
 *  - 그 외 비어있지 않은 값 → 텍스트(주로 emoji) 그대로
 *  - null/empty → null (호출자가 status 기반 기본 아이콘으로 fallback) */
export function resolveClusterIcon(icon?: string | null): ResolvedClusterIcon {
  if (!icon) return null;
  const trimmed = icon.trim();
  if (!trimmed) return null;
  if (Object.prototype.hasOwnProperty.call(CLUSTER_ICON_OPTIONS, trimmed)) {
    return { kind: 'lucide', Component: CLUSTER_ICON_OPTIONS[trimmed] };
  }
  return { kind: 'text', value: trimmed };
}
