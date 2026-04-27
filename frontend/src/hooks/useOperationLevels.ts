import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uiSettingsApi } from '@/services/api';
import type { OperationLevelItem } from '@/types';

export const opsLevelsKeys = {
  list: ['ui-settings', 'operation-levels'] as const,
};

const FALLBACK: OperationLevelItem[] = [
  { value: 'production', label: '운영 (Production)', color: 'red' },
  { value: 'staging',    label: '스테이징 (Staging)', color: 'amber' },
  { value: 'dev',        label: '개발 (Dev)',         color: 'blue' },
  { value: 'test',       label: '테스트 (Test)',      color: 'slate' },
  { value: 'dr',         label: 'DR',                 color: 'purple' },
];

export function useOperationLevels() {
  return useQuery({
    queryKey: opsLevelsKeys.list,
    queryFn: async () => {
      const { data } = await uiSettingsApi.getOperationLevels();
      return data.levels;
    },
    staleTime: 60_000,
    placeholderData: FALLBACK,
  });
}

export function useUpdateOperationLevels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (levels: OperationLevelItem[]) => uiSettingsApi.updateOperationLevels(levels),
    onSuccess: () => qc.invalidateQueries({ queryKey: opsLevelsKeys.list }),
  });
}

// ── 색상 토큰 → 클래스 매핑 (Tailwind 동적 클래스 회피) ──────────────
const COLOR_BADGE: Record<string, string> = {
  red:     'bg-red-500/15     text-red-400     border-red-500/30',
  amber:   'bg-amber-500/15   text-amber-400   border-amber-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  sky:     'bg-sky-500/15     text-sky-400     border-sky-500/30',
  blue:    'bg-blue-500/15    text-blue-400    border-blue-500/30',
  purple:  'bg-purple-500/15  text-purple-400  border-purple-500/30',
  pink:    'bg-pink-500/15    text-pink-400    border-pink-500/30',
  yellow:  'bg-yellow-500/15  text-yellow-400  border-yellow-500/30',
  cyan:    'bg-cyan-500/15    text-cyan-400    border-cyan-500/30',
  violet:  'bg-violet-500/15  text-violet-400  border-violet-500/30',
  orange:  'bg-orange-500/15  text-orange-400  border-orange-500/30',
  slate:   'bg-slate-500/15   text-slate-400   border-slate-500/30',
  muted:   'bg-muted          text-muted-foreground border-border',
};

export const COLOR_OPTIONS = Object.keys(COLOR_BADGE);

export function levelBadgeClass(color: string | undefined): string {
  return COLOR_BADGE[color ?? 'slate'] ?? COLOR_BADGE.slate;
}

/** value → label 매핑 (라벨이 없으면 value 그대로) */
export function levelLabel(levels: OperationLevelItem[] | undefined, value: string | null | undefined): string {
  if (!value) return '';
  const hit = levels?.find((l) => l.value === value);
  return hit?.label ?? value;
}

/** value → color */
export function levelColor(levels: OperationLevelItem[] | undefined, value: string | null | undefined): string {
  if (!value) return 'slate';
  const hit = levels?.find((l) => l.value === value);
  return hit?.color ?? 'slate';
}
