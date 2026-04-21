export const OPERATION_LEVELS = [
  { value: 'production', label: '운영 (Production)' },
  { value: 'staging',    label: '스테이징 (Staging)' },
  { value: 'dev',        label: '개발 (Dev)' },
  { value: 'test',       label: '테스트 (Test)' },
  { value: 'dr',         label: 'DR' },
];

export const LEVEL_BADGE: Record<string, string> = {
  production: 'bg-red-500/15 text-red-400 border-red-500/30',
  staging:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  dev:        'bg-blue-500/15 text-blue-400 border-blue-500/30',
  test:       'bg-slate-500/15 text-slate-400 border-slate-500/30',
  dr:         'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export const STATUS_STYLE: Record<string, { dot: string; border: string; badge: string; label: string }> = {
  healthy:  { dot: 'bg-emerald-500', border: 'border-l-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400', label: 'Healthy'  },
  warning:  { dot: 'bg-amber-500',   border: 'border-l-amber-500',   badge: 'bg-amber-500/10 text-amber-400',    label: 'Warning'  },
  critical: { dot: 'bg-red-500',     border: 'border-l-red-500',     badge: 'bg-red-500/10 text-red-400',        label: 'Critical' },
  pending:  { dot: 'bg-slate-400',   border: 'border-l-slate-400',   badge: 'bg-slate-500/10 text-slate-400',    label: '미연결'   },
};

export const OVERLAP_COLORS = [
  { bg: 'bg-orange-500/10', text: 'text-orange-300', border: 'border-orange-500/40', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500/10',   text: 'text-pink-300',   border: 'border-pink-500/40',   dot: 'bg-pink-400'   },
  { bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   border: 'border-cyan-500/40',   dot: 'bg-cyan-400'   },
  { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/40', dot: 'bg-yellow-400' },
  { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/40', dot: 'bg-violet-400' },
];

export type OverlapColor = typeof OVERLAP_COLORS[0];
