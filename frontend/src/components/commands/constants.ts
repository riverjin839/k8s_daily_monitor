import type { CommandImportance } from '@/types';

export const IMPORTANCE_OPTIONS: CommandImportance[] = ['info', 'low', 'medium', 'high', 'critical'];

export const IMPORTANCE_META: Record<CommandImportance, {
  label: string; badge: string; rowAccent: string;
}> = {
  info:     { label: '정보',  badge: 'bg-slate-500/15  text-slate-600  border-slate-500/30',  rowAccent: 'border-l-slate-400/60' },
  low:      { label: '낮음',  badge: 'bg-sky-500/15    text-sky-700    border-sky-500/30',    rowAccent: 'border-l-sky-500/70' },
  medium:   { label: '보통',  badge: 'bg-amber-500/15  text-amber-700  border-amber-500/30',  rowAccent: 'border-l-amber-500/70' },
  high:     { label: '높음',  badge: 'bg-orange-500/15 text-orange-700 border-orange-500/30', rowAccent: 'border-l-orange-500/80' },
  critical: { label: '치명',  badge: 'bg-red-500/20    text-red-700    border-red-500/40 font-semibold', rowAccent: 'border-l-red-500' },
};
