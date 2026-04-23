import { useState } from 'react';
import { Pencil, Trash2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import type { Cluster } from '@/types';
import { useUpdateCluster } from '@/hooks/useCluster';
import { InlineEdit } from '@/components/common';
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

type EditField = null | 'region' | 'operationLevel' | 'cidr' | 'podCidr' | 'svcCidr';

/** 편집 가능 셀 wrapper — 더블클릭 OR hover 시 나타나는 ✏️ 아이콘 클릭으로 진입.
 *  text 선택을 막아 dblclick 이 안정적으로 발화되게 함.
 */
function EditableCell({
  isEditing, onEnter, children, className = '',
}: {
  isEditing: boolean;
  onEnter: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (isEditing) {
    return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
  }
  return (
    <td
      className={`px-3 py-2.5 select-none cursor-pointer relative group hover:bg-primary/5 transition-colors ${className}`}
      onDoubleClick={(e) => { e.preventDefault(); onEnter(); }}
      onClick={(e) => {
        // 더블클릭 안전망 — detail===2 가 dblclick 보다 먼저 들어오므로 무시
        if (e.detail === 2) return;
      }}
      title="더블클릭 또는 ✏️ 클릭으로 수정"
    >
      {children}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEnter(); }}
        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary hover:bg-secondary/80 transition-opacity"
        title="이 셀 수정"
        aria-label="수정"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </td>
  );
}

export function ClusterTableRow({ cluster, onEdit, onDelete, deletingId, overlapGroupIdx, onCilium, onAutoUpdate, autoUpdatingId }: ClusterTableRowProps) {
  const updateCluster = useUpdateCluster();
  const [editingField, setEditingField] = useState<EditField>(null);

  const quickUpdate = (patch: Partial<Cluster>) => {
    updateCluster.mutate({ id: cluster.id, data: patch }, { onSettled: () => setEditingField(null) });
  };
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

      {/* 지역 — 인라인 편집 */}
      <EditableCell
        isEditing={editingField === 'region'}
        onEnter={() => setEditingField('region')}
        className="text-sm text-muted-foreground"
      >
        {editingField === 'region' ? (
          <InlineEdit
            value={cluster.region ?? ''}
            onSave={(v) => quickUpdate({ region: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="예: 서울"
            inputClassName="text-sm"
          />
        ) : (cluster.region || <span className="text-muted-foreground/60">-</span>)}
      </EditableCell>

      {/* 운영레벨 — select 인라인 */}
      <EditableCell
        isEditing={editingField === 'operationLevel'}
        onEnter={() => setEditingField('operationLevel')}
      >
        {editingField === 'operationLevel' ? (
          <select
            autoFocus
            value={cluster.operationLevel ?? ''}
            onChange={(e) => quickUpdate({ operationLevel: e.target.value || undefined })}
            onBlur={() => setEditingField(null)}
            className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
          >
            <option value="">—</option>
            {OPERATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        ) : cluster.operationLevel ? (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${lv}`}>
            {OPERATION_LEVELS.find(l => l.value === cluster.operationLevel)?.label ?? cluster.operationLevel}
          </span>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      <td className="px-3 py-2.5">
        {cluster.bgpEnabled ? (
          <div>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">BGP</span>
            {cluster.asNumber && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">AS{cluster.asNumber}</p>}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </td>

      {/* Node CIDR */}
      <EditableCell
        isEditing={editingField === 'cidr'}
        onEnter={() => setEditingField('cidr')}
      >
        {editingField === 'cidr' ? (
          <InlineEdit
            value={cluster.cidr ?? ''}
            onSave={(v) => quickUpdate({ cidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="192.168.0.0/24"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.cidr ? (
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
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      {/* Pod CIDR */}
      <EditableCell
        isEditing={editingField === 'podCidr'}
        onEnter={() => setEditingField('podCidr')}
      >
        {editingField === 'podCidr' ? (
          <InlineEdit
            value={cluster.podCidr ?? ''}
            onSave={(v) => quickUpdate({ podCidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="10.244.0.0/16"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.podCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.podCidr}</p>
            {(cluster.podFirstHost || cluster.podLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.podFirstHost} ~ {cluster.podLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      {/* Service CIDR */}
      <EditableCell
        isEditing={editingField === 'svcCidr'}
        onEnter={() => setEditingField('svcCidr')}
      >
        {editingField === 'svcCidr' ? (
          <InlineEdit
            value={cluster.svcCidr ?? ''}
            onSave={(v) => quickUpdate({ svcCidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="10.96.0.0/12"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.svcCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.svcCidr}</p>
            {(cluster.svcFirstHost || cluster.svcLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.svcFirstHost} ~ {cluster.svcLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      <td className="px-3 py-2.5 text-sm text-center">
        {cluster.maxPod
          ? <span className="font-mono text-foreground">{cluster.maxPod}</span>
          : <span className="text-muted-foreground/60 text-xs">-</span>}
      </td>
      <td className="px-3 py-2.5 max-w-[220px]">
        <p className="text-[11px] font-mono text-muted-foreground truncate" title={cluster.apiEndpoint}>
          {cluster.apiEndpoint}
        </p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {cluster.k8sVersion && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20">
              k8s {cluster.k8sVersion}
            </span>
          )}
          {cluster.ciliumVersion && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
              cilium {cluster.ciliumVersion}
            </span>
          )}
        </div>
        {cluster.nodeCount && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5" title={cluster.nodeIps ?? ''}>
            노드 {cluster.nodeCount}개
          </p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => onAutoUpdate(cluster)}
            className={`p-1.5 rounded transition-colors ${
              autoUpdatingId === cluster.id
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
            title={autoUpdatingId === cluster.id ? '중지' : '클러스터 정보 수집 (kubeconfig 기반)'}>
            {autoUpdatingId === cluster.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onCilium(cluster)}
            className="px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 rounded transition-colors">
            Cilium
          </button>
          <button onClick={() => onEdit(cluster)}
            className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="전체 수정 (모달)">
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
