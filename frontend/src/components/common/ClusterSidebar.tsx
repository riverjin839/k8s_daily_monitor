import { Server, CheckCircle, AlertTriangle, XCircle, WifiOff, LayoutGrid } from 'lucide-react';
import type { Cluster, Status } from '@/types';

interface ClusterSidebarProps {
  clusters: Cluster[];
  /** 현재 선택 — null 이면 전체(All), 문자열이면 해당 cluster.id */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
  /** 지금 선택된 클러스터가 상단 고정 (풀 배경) */
  highlightActive?: boolean;
  /** 최상단에 "전체" 선택지 (Dashboard 에 유용) */
  allowAll?: boolean;
  /** "전체" 표시 라벨 */
  allLabel?: string;
}

const STATUS_ICON: Record<Status, React.ComponentType<{ className?: string }>> = {
  healthy: CheckCircle,
  warning: AlertTriangle,
  critical: XCircle,
  pending: WifiOff,
};

const STATUS_DOT: Record<Status, string> = {
  healthy:  'bg-emerald-500',
  warning:  'bg-amber-500',
  critical: 'bg-red-500',
  pending:  'bg-slate-400',
};

/** 좌측 클러스터 선택 사이드바 — 오른쪽 상단 드롭다운 대체.
 *  부모가 flex row 레이아웃을 잡아주면, 이 컴포넌트는 자기 폭을 가짐.
 */
export function ClusterSidebar({
  clusters, selectedId, onSelect, title = '클러스터',
  highlightActive = true, allowAll = false, allLabel = '전체 클러스터',
}: ClusterSidebarProps) {
  const totalN = clusters.length;

  return (
    <aside className="w-52 flex-shrink-0 bg-card border border-border rounded-xl p-2 h-fit sticky top-4">
      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        <span className="ml-1 text-muted-foreground/60">({totalN})</span>
      </p>

      {allowAll && (
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors mb-0.5 ${
            selectedId === null && highlightActive
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'hover:bg-secondary text-foreground border border-transparent'
          }`}
        >
          <LayoutGrid className={`w-3.5 h-3.5 flex-shrink-0 ${selectedId === null ? 'text-primary' : 'text-muted-foreground/60'}`} />
          <span className="flex-1 min-w-0 text-sm font-medium truncate">{allLabel}</span>
          {totalN > 0 && (
            <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">{totalN}</span>
          )}
        </button>
      )}

      <div className="space-y-0.5">
        {clusters.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground/70">등록된 클러스터 없음</p>
        ) : (
          clusters.map((c) => {
            const Icon = STATUS_ICON[c.status] ?? Server;
            const active = highlightActive && c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'hover:bg-secondary text-foreground border border-transparent'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[c.status] ?? 'bg-slate-400'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{c.name}</span>
                  {(c.region || c.operationLevel) && (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {c.region}{c.region && c.operationLevel ? ' · ' : ''}{c.operationLevel}
                    </span>
                  )}
                </span>
                <Icon className={`w-3 h-3 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/60'}`} />
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

