import { Pencil, Trash2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import type { Cluster } from '@/types';
import { STATUS_STYLE, LEVEL_BADGE, OPERATION_LEVELS } from './constants';

interface ClusterTableRowProps {
  cluster: Cluster;
  onEdit: (c: Cluster) => void;
  onDelete: (c: Cluster) => void;
  deletingId: string | null;
  overlapGroupIdx: number | undefined;
  onCilium: (c: Cluster) => void;
  onAutoUpdate: (c: Cluster) => void;
  autoUpdatingId: string | null;
}

export function ClusterTableRow({ cluster, onEdit, onDelete, deletingId, overlapGroupIdx, onCilium, onAutoUpdate, autoUpdatingId }: ClusterTableRowProps) {
  const st = STATUS_STYLE[cluster.status] ?? STATUS_STYLE.pending;
  const lv = LEVEL_BADGE[cluster.operationLevel ?? ''];

  return (
    <tr className="border-b border-border hover:bg-secondary/20 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
          <span className="font-medium text-sm text-foreground">{cluster.name}</span>
        </div>
        {cluster.hostname && (
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5 ml-4">{cluster.hostname}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
      </td>
      <td className="px-3 py-2.5 text-sm text-muted-foreground">{cluster.region || '-'}</td>
      <td className="px-3 py-2.5">
        {cluster.operationLevel ? (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${lv}`}>
            {OPERATION_LEVELS.find(l => l.value === cluster.operationLevel)?.label ?? cluster.operationLevel}
          </span>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5">
        {cluster.bgpEnabled ? (
          <div>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">BGP</span>
            {cluster.asNumber && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">AS{cluster.asNumber}</p>}
          </div>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5">
        {cluster.cidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.cidr}</p>
            {(cluster.firstHost || cluster.lastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.firstHost} ~ {cluster.lastHost}</p>
            )}
            {overlapGroupIdx !== undefined && (
              <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />겹침
              </span>
            )}
          </div>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5">
        {cluster.podCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.podCidr}</p>
            {(cluster.podFirstHost || cluster.podLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.podFirstHost} ~ {cluster.podLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5">
        {cluster.svcCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.svcCidr}</p>
            {(cluster.svcFirstHost || cluster.svcLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.svcFirstHost} ~ {cluster.svcLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5 text-sm text-center">
        {cluster.maxPod
          ? <span className="font-mono text-foreground">{cluster.maxPod}</span>
          : <span className="text-muted-foreground text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5 max-w-[180px]">
        <p className="text-[11px] font-mono text-muted-foreground truncate" title={cluster.apiEndpoint}>
          {cluster.apiEndpoint}
        </p>
        {cluster.nodeCount && (
          <p className="text-[10px] text-muted-foreground/60">노드 {cluster.nodeCount}개</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => onAutoUpdate(cluster)} disabled={autoUpdatingId === cluster.id}
            className="p-1.5 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors"
            title="kubeconfig 기반 자동 업데이트">
            {autoUpdatingId === cluster.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onCilium(cluster)}
            className="px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 rounded transition-colors">
            Cilium
          </button>
          <button onClick={() => onEdit(cluster)}
            className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="수정">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(cluster)} disabled={deletingId === cluster.id}
            className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400 disabled:opacity-40 transition-colors" title="삭제">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
