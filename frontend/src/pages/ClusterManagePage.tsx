import { useState } from 'react';
import { Server, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { Cluster, ClusterManageUpdate } from '@/types';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { clustersApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';

// ── 운영레벨 옵션 ────────────────────────────────────────────────────────────
const OPERATION_LEVELS = [
  { value: 'production', label: '운영 (Production)' },
  { value: 'staging', label: '스테이징 (Staging)' },
  { value: 'dev', label: '개발 (Dev)' },
  { value: 'test', label: '테스트 (Test)' },
  { value: 'dr', label: 'DR' },
];

const LEVEL_BADGE: Record<string, string> = {
  production: 'bg-red-500/15 text-red-400 border-red-500/30',
  staging:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  dev:        'bg-blue-500/15 text-blue-400 border-blue-500/30',
  test:       'bg-slate-500/15 text-slate-400 border-slate-500/30',
  dr:         'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

// ── 정렬 ─────────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'status' | 'operationLevel' | 'region' | 'nodeCount';

function SortTh({
  label, col, sortKey, sortDir, onSort, className,
}: {
  label: string; col: SortKey; sortKey: SortKey | ''; sortDir: 'asc' | 'desc';
  onSort: (c: SortKey) => void; className?: string;
}) {
  const isActive = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground transition-colors ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive
          ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />
          : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
      </span>
    </th>
  );
}

// ── 모달 ─────────────────────────────────────────────────────────────────────
interface ClusterMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  onSaved: () => void;
}

function ClusterMetaModal({ isOpen, onClose, cluster, onSaved }: ClusterMetaModalProps) {
  const [region, setRegion] = useState(cluster.region ?? '');
  const [operationLevel, setOperationLevel] = useState(cluster.operationLevel ?? '');
  const [nodeCount, setNodeCount] = useState<string>(cluster.nodeCount?.toString() ?? '');
  const [maxPod, setMaxPod] = useState<string>(cluster.maxPod?.toString() ?? '');
  const [cidr, setCidr] = useState(cluster.cidr ?? '');
  const [hostname, setHostname] = useState(cluster.hostname ?? '');
  const [ciliumConfig, setCiliumConfig] = useState(cluster.ciliumConfig ?? '');
  const [description, setDescription] = useState(cluster.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: ClusterManageUpdate = {
        region: region.trim() || undefined,
        operationLevel: operationLevel || undefined,
        nodeCount: nodeCount ? Number(nodeCount) : undefined,
        maxPod: maxPod ? Number(maxPod) : undefined,
        cidr: cidr.trim() || undefined,
        hostname: hostname.trim() || undefined,
        ciliumConfig: ciliumConfig.trim() || undefined,
        description: description.trim() || undefined,
      };
      await clustersApi.update(cluster.id, payload as Record<string, unknown>);
      onSaved();
      onClose();
    } catch {
      setError('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const labelClass = 'block text-sm font-medium mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">클러스터 정보 수정</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{cluster.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 섹션: 위치/운영 정보 */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">위치 및 운영 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>지역</label>
                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)}
                  placeholder="예: 서울, 부산, ap-northeast-2" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>운영레벨</label>
                <select value={operationLevel} onChange={(e) => setOperationLevel(e.target.value)} className={inputClass}>
                  <option value="">— 선택 —</option>
                  {OPERATION_LEVELS.map((lvl) => (
                    <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>호스트명</label>
                <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)}
                  placeholder="예: k8s-prod-master.example.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CIDR</label>
                <input type="text" value={cidr} onChange={(e) => setCidr(e.target.value)}
                  placeholder="예: 10.0.0.0/16, 192.168.1.0/24" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 섹션: 노드 정보 */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">노드 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>노드 수</label>
                <input type="number" min="0" value={nodeCount} onChange={(e) => setNodeCount(e.target.value)}
                  placeholder="예: 5" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Max Pod (노드당)</label>
                <input type="number" min="0" value={maxPod} onChange={(e) => setMaxPod(e.target.value)}
                  placeholder="예: 110" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 섹션: 설정 정보 */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">설정 정보</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>주요 Cilium 설정</label>
                <textarea value={ciliumConfig} onChange={(e) => setCiliumConfig(e.target.value)}
                  placeholder="예: tunnel: vxlan&#10;kubeProxyReplacement: strict&#10;ipv4NativeRoutingCIDR: 10.0.0.0/8"
                  rows={4} className={`${inputClass} resize-none font-mono text-xs`} />
              </div>
              <div>
                <label className={labelClass}>정보 / 설명</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="클러스터에 대한 추가 정보나 메모를 입력하세요"
                  rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-60">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 상세 정보 모달 ────────────────────────────────────────────────────────────
function ClusterDetailModal({ cluster, onClose, onEdit }: {
  cluster: Cluster; onClose: () => void; onEdit: () => void;
}) {
  const rows: { label: string; value: string | number | undefined | null }[] = [
    { label: 'API Endpoint', value: cluster.apiEndpoint },
    { label: '상태', value: cluster.status },
    { label: '지역', value: cluster.region },
    { label: '운영레벨', value: cluster.operationLevel },
    { label: '호스트명', value: cluster.hostname },
    { label: '노드 수', value: cluster.nodeCount },
    { label: 'Max Pod', value: cluster.maxPod },
    { label: 'CIDR', value: cluster.cidr },
    { label: '등록일', value: cluster.createdAt?.slice(0, 10) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{cluster.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md"><X className="w-5 h-5" /></button>
        </div>

        <dl className="space-y-2.5">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <dt className="text-sm text-muted-foreground w-28 flex-shrink-0">{label}</dt>
              <dd className="text-sm font-medium break-all">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>

        {(cluster.ciliumConfig || cluster.description) && (
          <div className="mt-4 space-y-3">
            {cluster.ciliumConfig && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Cilium 설정</p>
                <pre className="text-xs bg-muted/30 border border-border rounded-lg p-3 whitespace-pre-wrap font-mono">
                  {cluster.ciliumConfig}
                </pre>
              </div>
            )}
            {cluster.description && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">정보 / 설명</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{cluster.description}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onEdit}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2">
            <Pencil className="w-4 h-4" /> 수정
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function ClusterManagePage() {
  const { clusters } = useClusterStore();
  useClusters();
  const queryClient = useQueryClient();

  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [detailCluster, setDetailCluster] = useState<Cluster | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSort = (col: SortKey) => {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  };

  const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
  const sortedClusters = [...clusters].sort((a, b) => {
    if (!sortKey) return 0;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'status') cmp = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
    else if (sortKey === 'operationLevel') cmp = (a.operationLevel ?? '').localeCompare(b.operationLevel ?? '');
    else if (sortKey === 'region') cmp = (a.region ?? '').localeCompare(b.region ?? '');
    else if (sortKey === 'nodeCount') cmp = (a.nodeCount ?? 0) - (b.nodeCount ?? 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleDelete = async (cluster: Cluster) => {
    if (!confirm(`"${cluster.name}" 클러스터를 삭제하시겠습니까?\n연관된 Addon, Playbook, 점검 이력이 모두 삭제됩니다.`)) return;
    setDeletingId(cluster.id);
    try {
      await clustersApi.delete(cluster.id);
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['clusters'] });
  };

  const STATUS_DOT: Record<string, string> = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
  };
  const STATUS_LABEL: Record<string, string> = {
    healthy: 'Healthy',
    warning: 'Warning',
    critical: 'Critical',
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">클러스터 관리</h1>
            {clusters.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                전체 {clusters.length}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {clusters.length === 0 ? (
          <div className="text-center py-20">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">등록된 클러스터가 없습니다.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Settings 페이지에서 클러스터를 먼저 등록하세요.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <SortTh label="클러스터명" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="상태" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="운영레벨" col="operationLevel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="지역" col="region" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="노드 수" col="nodeCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Max Pod</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">CIDR</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">호스트명</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">정보</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedClusters.map((cluster) => (
                    <tr
                      key={cluster.id}
                      className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setDetailCluster(cluster)}
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{cluster.name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[cluster.status] ?? 'bg-slate-400'}`} />
                          <span className="text-xs">{STATUS_LABEL[cluster.status] ?? cluster.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cluster.operationLevel ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${LEVEL_BADGE[cluster.operationLevel] ?? 'bg-muted text-muted-foreground border-border'}`}>
                            {OPERATION_LEVELS.find((l) => l.value === cluster.operationLevel)?.label ?? cluster.operationLevel}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{cluster.region || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs">{cluster.nodeCount ?? '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs">{cluster.maxPod ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cluster.cidr || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate">{cluster.hostname || '-'}</td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="line-clamp-2 text-xs text-muted-foreground">{cluster.description || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailCluster(null); setEditCluster(cluster); }}
                            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(cluster); }}
                            disabled={deletingId === cluster.id}
                            className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 등록 안내 */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          클러스터 등록 및 API/kubeconfig 설정은 <strong>Settings</strong> 페이지에서 할 수 있습니다.
        </p>
      </main>

      {/* Edit Modal */}
      {editCluster && (
        <ClusterMetaModal
          isOpen={true}
          onClose={() => setEditCluster(null)}
          cluster={editCluster}
          onSaved={handleSaved}
        />
      )}

      {/* Detail Modal */}
      {detailCluster && !editCluster && (
        <ClusterDetailModal
          cluster={detailCluster}
          onClose={() => setDetailCluster(null)}
          onEdit={() => { setEditCluster(detailCluster); setDetailCluster(null); }}
        />
      )}
    </div>
  );
}
