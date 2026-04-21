import { useState, useMemo } from 'react';
import { ViewModeBar } from '@/components/common';
import {
  Server, AlertTriangle, Search, ChevronDown,
  LayoutList, LayoutGrid,
} from 'lucide-react';
import type { Cluster } from '@/types';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { clustersApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import {
  ClusterMetaModal,
  CiliumConfigModal,
  ClusterCard,
  ClusterTableRow,
} from '@/components/cluster-manage';
import { OPERATION_LEVELS } from '@/components/cluster-manage';

// ── CIDR 겹침 유틸 ────────────────────────────────────────────────────────────
function cidrIpToNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}
function parseCidrRange(cidr: string): { start: number; end: number } | null {
  const m = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const prefix = parseInt(m[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  const ipNum = cidrIpToNum(m[1]);
  const mask  = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net   = (ipNum & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  return { start: net, end: bcast };
}
function cidrsOverlap(a: string, b: string): boolean {
  const ra = parseCidrRange(a), rb = parseCidrRange(b);
  return !!ra && !!rb && ra.start <= rb.end && rb.start <= ra.end;
}

const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, healthy: 2, pending: 3 };

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function ClusterManagePage() {
  const { clusters } = useClusterStore();
  useClusters();
  const queryClient = useQueryClient();

  const [editCluster, setEditCluster]     = useState<Cluster | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [filterLevel, setFilterLevel]     = useState('');
  const [sortBy, setSortBy]               = useState<'name' | 'status' | 'level'>('name');
  const [showFilter, setShowFilter]       = useState(false);
  const [viewMode, setViewMode]           = useState<'table' | 'card'>('table');
  const [ciliumCluster, setCiliumCluster] = useState<Cluster | null>(null);

  const filteredClusters = useMemo(() => {
    let list = [...clusters];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.region ?? '').toLowerCase().includes(q) ||
        (c.hostname ?? '').toLowerCase().includes(q) ||
        (c.apiEndpoint ?? '').toLowerCase().includes(q),
      );
    }
    if (filterLevel) list = list.filter(c => c.operationLevel === filterLevel);
    list.sort((a, b) => {
      if (sortBy === 'status') return (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
      if (sortBy === 'level')  return (a.operationLevel ?? '').localeCompare(b.operationLevel ?? '');
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [clusters, search, filterLevel, sortBy]);

  const cidrOverlapGroups = useMemo(() => {
    if (clusters.length < 2) return new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const c of clusters) adj.set(c.id, []);
    const keys: (keyof Cluster)[] = ['cidr', 'podCidr', 'svcCidr'];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ci = clusters[i], cj = clusters[j];
        let overlap = false;
        outer: for (const ki of keys) {
          for (const kj of keys) {
            const vi = ci[ki] as string | undefined;
            const vj = cj[kj] as string | undefined;
            if (vi && vj && cidrsOverlap(vi, vj)) { overlap = true; break outer; }
          }
        }
        if (overlap) { adj.get(ci.id)!.push(cj.id); adj.get(cj.id)!.push(ci.id); }
      }
    }
    const groupMap = new Map<string, number>();
    const visited  = new Set<string>();
    let gIdx = 0;
    for (const c of clusters) {
      if (visited.has(c.id) || (adj.get(c.id)?.length ?? 0) === 0) continue;
      const q = [c.id];
      visited.add(c.id);
      while (q.length) {
        const id = q.shift()!;
        groupMap.set(id, gIdx);
        for (const nb of adj.get(id) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        }
      }
      gIdx++;
    }
    return groupMap;
  }, [clusters]);

  const overlapCount = cidrOverlapGroups.size;

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

  const handleSaved = () => queryClient.invalidateQueries({ queryKey: ['clusters'] });

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">클러스터 관리</h1>
            {clusters.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                {filteredClusters.length} / {clusters.length}
              </span>
            )}
            {overlapCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" />
                CIDR 겹침 {overlapCount}건
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ViewModeBar
              modes={[
                { id: 'table', label: '테이블', icon: <LayoutList className="w-3.5 h-3.5" /> },
                { id: 'card',  label: '카드',   icon: <LayoutGrid className="w-3.5 h-3.5" /> },
              ]}
              active={viewMode}
              onChange={(v) => setViewMode(v as 'table' | 'card')}
              showStylePanel={false}
            />
            <button
              onClick={() => setShowFilter(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            >
              검색 / 필터
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilter ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* 검색 / 필터 패널 */}
        {showFilter && (
          <div className="mb-5 p-4 bg-card border border-border rounded-xl flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">검색</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="이름, 지역, 호스트명, API Endpoint"
                  className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs text-muted-foreground mb-1">운영레벨</label>
              <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">전체</option>
                {OPERATION_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs text-muted-foreground mb-1">정렬</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'status' | 'level')}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="name">이름순</option>
                <option value="status">상태순</option>
                <option value="level">운영레벨순</option>
              </select>
            </div>
            {(search || filterLevel) && (
              <button onClick={() => { setSearch(''); setFilterLevel(''); }}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-lg transition-colors">
                초기화
              </button>
            )}
          </div>
        )}

        {/* 클러스터 목록 */}
        {clusters.length === 0 ? (
          <div className="text-center py-20">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">등록된 클러스터가 없습니다.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Settings 페이지에서 클러스터를 먼저 등록하세요.</p>
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>검색 결과가 없습니다.</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-secondary/50">
                  <tr className="border-b border-border">
                    {['클러스터명', '상태', '지역', '운영레벨', 'BGP / AS', 'Node CIDR', 'Pod CIDR', 'Svc CIDR', 'Max Pods', 'K8s 정보', '액션'].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground ${h === 'Max Pods' ? 'text-center' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredClusters.map(cluster => (
                    <ClusterTableRow
                      key={cluster.id}
                      cluster={cluster}
                      onEdit={c => setEditCluster(c)}
                      onDelete={handleDelete}
                      deletingId={deletingId}
                      overlapGroupIdx={cidrOverlapGroups.get(cluster.id)}
                      onCilium={c => setCiliumCluster(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {filteredClusters.map(cluster => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onEdit={c => setEditCluster(c)}
                onDelete={handleDelete}
                deletingId={deletingId}
                overlapGroupIdx={cidrOverlapGroups.get(cluster.id)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6 text-center">
          클러스터 등록 및 API/kubeconfig 설정은 <strong>Settings</strong> 페이지에서 할 수 있습니다.
        </p>
      </main>

      {editCluster && (
        <ClusterMetaModal
          isOpen
          onClose={() => setEditCluster(null)}
          cluster={editCluster}
          onSaved={handleSaved}
        />
      )}
      {ciliumCluster && (
        <CiliumConfigModal
          cluster={ciliumCluster}
          onClose={() => setCiliumCluster(null)}
        />
      )}
    </div>
  );
}
