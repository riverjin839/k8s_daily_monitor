import { useState } from 'react';
import { Pencil, Trash2, Cpu, Network, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import type { Cluster } from '@/types';
import { STATUS_STYLE, OVERLAP_COLORS } from './constants';
import { useOperationLevels, levelBadgeClass, levelLabel, levelColor } from '@/hooks/useOperationLevels';
import { CidrRow } from './CidrRow';
import { InternalIpRow } from './InternalIpRow';
import { BondIpRow } from './BondIpRow';

type CardTab = 'node' | 'network';

interface ClusterCardProps {
  cluster: Cluster;
  onEdit: (c: Cluster) => void;
  onDelete: (c: Cluster) => void;
  deletingId: string | null;
  overlapGroupIdx: number | undefined;
  onAutoUpdate: (c: Cluster) => void;
  autoUpdatingId: string | null;
}

export function ClusterCard({ cluster, onEdit, onDelete, deletingId, overlapGroupIdx, onAutoUpdate, autoUpdatingId }: ClusterCardProps) {
  const [tab, setTab] = useState<CardTab>('node');
  const st = STATUS_STYLE[cluster.status] ?? STATUS_STYLE.pending;
  const { data: opsLevels } = useOperationLevels();
  const overlapColor = overlapGroupIdx !== undefined
    ? OVERLAP_COLORS[overlapGroupIdx % OVERLAP_COLORS.length]
    : null;

  const hasNodeData    = !!(cluster.nodeCount || cluster.maxPod || cluster.hostname || cluster.bond0Ip || cluster.bond1Ip);
  const hasNetworkData = !!(cluster.cidr || cluster.podCidr || cluster.svcCidr || cluster.nodeIps);

  return (
    <div className={`bg-card border border-border border-l-4 ${st.border} rounded-xl flex flex-col shadow-sm hover:shadow-md transition-shadow`}>
      {/* 카드 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
              <h3 className="text-sm font-bold truncate">{cluster.name}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
              {cluster.operationLevel && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${levelBadgeClass(levelColor(opsLevels, cluster.operationLevel))}`}>
                  {levelLabel(opsLevels, cluster.operationLevel)}
                </span>
              )}
              {cluster.region && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {cluster.region}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onAutoUpdate(cluster)}
              className={`p-1.5 rounded-md transition-colors ${
                autoUpdatingId === cluster.id
                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
              title={autoUpdatingId === cluster.id ? '중지' : '클러스터 정보 수집 (kubeconfig 기반)'}>
              {autoUpdatingId === cluster.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => onEdit(cluster)}
              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground" title="수정">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(cluster)} disabled={deletingId === cluster.id}
              className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40" title="삭제">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground/60 mt-1.5 truncate" title={cluster.apiEndpoint}>
          {cluster.apiEndpoint}
        </p>
      </div>

      {/* 탭 스위처 */}
      <div className="flex border-b border-border/50">
        <button onClick={() => setTab('node')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === 'node' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground'
          }`}>
          <Cpu className="w-3 h-3" />노드 스펙
          {hasNodeData && tab !== 'node' && <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />}
        </button>
        <button onClick={() => setTab('network')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === 'network' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground'
          }`}>
          <Network className="w-3 h-3" />N/W CIDR
          {overlapColor && <AlertTriangle className="w-3 h-3 text-amber-400" />}
          {hasNetworkData && tab !== 'network' && !overlapColor && <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="px-4 py-3 flex-1">
        {tab === 'node' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">노드 수</p>
                <p className="text-lg font-bold text-foreground">{cluster.nodeCount ?? <span className="text-muted-foreground text-sm">-</span>}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Max Pod</p>
                <p className="text-lg font-bold text-foreground">{cluster.maxPod ?? <span className="text-muted-foreground text-sm">-</span>}</p>
              </div>
            </div>
            {cluster.hostname && (
              <div className="px-3 py-2 bg-secondary/30 rounded-lg">
                <p className="text-[10px] text-muted-foreground mb-0.5">호스트명</p>
                <p className="text-xs font-mono text-foreground truncate">{cluster.hostname}</p>
              </div>
            )}
            {(cluster.bond0Ip || cluster.bond0Mac || cluster.bond1Ip || cluster.bond1Mac) ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">NIC</p>
                <div className="grid grid-cols-2 gap-2">
                  {(cluster.bond0Ip || cluster.bond0Mac) && (
                    <div className="border border-border rounded-lg px-2.5 py-2 bg-muted/10">
                      <p className="text-[10px] font-bold text-primary mb-1.5">bond0</p>
                      {cluster.bond0Ip && <div className="mb-1"><p className="text-[9px] text-muted-foreground uppercase">IP</p><p className="text-[11px] font-mono text-foreground">{cluster.bond0Ip}</p></div>}
                      {cluster.bond0Mac && <div><p className="text-[9px] text-muted-foreground uppercase">MAC</p><p className="text-[11px] font-mono text-foreground">{cluster.bond0Mac}</p></div>}
                    </div>
                  )}
                  {(cluster.bond1Ip || cluster.bond1Mac) && (
                    <div className="border border-border rounded-lg px-2.5 py-2 bg-muted/10">
                      <p className="text-[10px] font-bold text-primary mb-1.5">bond1</p>
                      {cluster.bond1Ip && <div className="mb-1"><p className="text-[9px] text-muted-foreground uppercase">IP</p><p className="text-[11px] font-mono text-foreground">{cluster.bond1Ip}</p></div>}
                      {cluster.bond1Mac && <div><p className="text-[9px] text-muted-foreground uppercase">MAC</p><p className="text-[11px] font-mono text-foreground">{cluster.bond1Mac}</p></div>}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              !cluster.nodeCount && !cluster.maxPod && !cluster.hostname && (
                <p className="text-xs text-muted-foreground/50 text-center py-2">노드 스펙 정보 없음 — 수정 버튼으로 입력하세요</p>
              )
            )}
          </div>
        )}

        {tab === 'network' && (
          <div className="space-y-2">
            <InternalIpRow cluster={cluster}
              overlapColor={cluster.cidr ? overlapColor : null} />
            <div className="grid grid-cols-2 gap-2">
              <BondIpRow cluster={cluster} bond="bond0" />
              <BondIpRow cluster={cluster} bond="bond1" />
            </div>
            <CidrRow label="Pod CIDR" cidr={cluster.podCidr} first={cluster.podFirstHost} last={cluster.podLastHost}
              color={{ bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-600', label: 'text-emerald-600' }}
              overlapColor={cluster.podCidr ? overlapColor : null} />
            <CidrRow label="Service CIDR" cidr={cluster.svcCidr} first={cluster.svcFirstHost} last={cluster.svcLastHost}
              color={{ bg: 'bg-violet-500/5', border: 'border-violet-500/20', text: 'text-violet-600', label: 'text-violet-600' }}
              overlapColor={cluster.svcCidr ? overlapColor : null} />
            {cluster.ciliumConfig && (
              <div className="mt-1 pt-2 border-t border-border/40">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cilium 설정</p>
                <pre className="text-[10px] font-mono text-muted-foreground bg-muted/20 rounded p-2 whitespace-pre-wrap max-h-20 overflow-y-auto">
                  {cluster.ciliumConfig}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {cluster.description && (
        <div className="px-4 pb-3 pt-1 border-t border-border/30 mt-auto">
          <p className="text-[10px] text-muted-foreground/70 line-clamp-2">{cluster.description}</p>
        </div>
      )}
    </div>
  );
}
