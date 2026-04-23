import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, Plus, Search, RefreshCw, Download, Trash2, Pencil,
  Server, Cpu, HardDrive, MapPin, Loader2, Square,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { ClusterSidebar, DebugLogPanel, ConfirmDialog } from '@/components/common';
import { useAbortableMutation } from '@/hooks/useAbortableMutation';
import { nodeSpecsApi } from '@/services/api';
import type { NodeServerSpec, NodeSpecStatus } from '@/types';
import { NodeSpecEditModal } from '@/components/node-specs/NodeSpecEditModal';

const STATUS_CLS: Record<string, string> = {
  active:       'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
  spare:        'bg-sky-500/10 text-sky-500 border-sky-500/30',
  maintenance:  'bg-amber-500/10 text-amber-500 border-amber-500/30',
  decommission: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

const STATUS_LABEL: Record<string, string> = {
  active: '운영중', spare: '예비', maintenance: '점검', decommission: '폐기',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLS[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/30';
  return (
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(rows: NodeServerSpec[]) {
  const cols: { k: keyof NodeServerSpec; label: string }[] = [
    { k: 'hostname', label: 'hostname' },
    { k: 'clusterName', label: 'cluster' },
    { k: 'role', label: 'role' },
    { k: 'status', label: 'status' },
    { k: 'internalIp', label: 'internal_ip' },
    { k: 'bmcIp', label: 'bmc_ip' },
    { k: 'vendor', label: 'vendor' },
    { k: 'model', label: 'model' },
    { k: 'serialNumber', label: 'serial' },
    { k: 'cpuModel', label: 'cpu_model' },
    { k: 'cpuSockets', label: 'sockets' },
    { k: 'cpuCores', label: 'cores' },
    { k: 'cpuThreads', label: 'threads' },
    { k: 'memoryGb', label: 'mem_gb' },
    { k: 'diskTotalGb', label: 'disk_gb' },
    { k: 'diskType', label: 'disk_type' },
    { k: 'gpuModel', label: 'gpu' },
    { k: 'gpuCount', label: 'gpu_count' },
    { k: 'datacenter', label: 'dc' },
    { k: 'rack', label: 'rack' },
    { k: 'rackUnit', label: 'u' },
    { k: 'osImage', label: 'os' },
    { k: 'kernelVersion', label: 'kernel' },
    { k: 'kubeletVersion', label: 'kubelet' },
    { k: 'assetTag', label: 'asset_tag' },
    { k: 'purchaseDate', label: 'purchase_date' },
    { k: 'warrantyEnd', label: 'warranty_end' },
    { k: 'owner', label: 'owner' },
  ];
  const header = cols.map((c) => c.label).join(',');
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c.k])).join(',')).join('\n');
  const csv = `${header}\n${body}\n`;
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `node-server-specs-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function NodeSpecPage() {
  const { data: clusters = [] } = useClusters();
  const qc = useQueryClient();

  const [clusterId, setClusterId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NodeSpecStatus | ''>('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  const [editTarget, setEditTarget] = useState<NodeServerSpec | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<NodeServerSpec | null>(null);

  const listQ = useQuery({
    queryKey: ['node-specs', clusterId, statusFilter, roleFilter, search],
    queryFn: ({ signal }) => nodeSpecsApi.list({
      clusterId: clusterId || undefined,
      status: statusFilter || undefined,
      role: roleFilter || undefined,
      search: search.trim() || undefined,
    }, signal).then((r) => r.data),
  });
  const rows: NodeServerSpec[] = useMemo(() => listQ.data?.data ?? [], [listQ.data]);

  const stats = useMemo(() => {
    const c: Record<string, number> = { total: rows.length, active: 0, spare: 0, maintenance: 0, decommission: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const importMut = useAbortableMutation({
    mutationFn: async (_: void, signal) => {
      if (!clusterId) throw new Error('클러스터를 먼저 선택하세요.');
      return (await nodeSpecsApi.importFromCluster(clusterId, { upsert: true }, signal)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['node-specs'] });
      alert(`임포트 완료 — 신규 ${data.inserted} / 업데이트 ${data.updated} / 변경없음 ${data.skipped}` +
        (data.errors.length ? `\n\n오류:\n${data.errors.join('\n')}` : ''));
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(`임포트 실패: ${err.response?.data?.detail ?? err.message ?? '알 수 없는 오류'}`);
    },
  });

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await nodeSpecsApi.delete(confirmDelete.id);
      qc.invalidateQueries({ queryKey: ['node-specs'] });
      setConfirmDelete(null);
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1800px] mx-auto px-4 py-3 flex gap-3">
        <ClusterSidebar
          clusters={clusters}
          selectedId={clusterId}
          onSelect={setClusterId}
          allowAll
          allLabel="전체 (등록 + 미배정)"
        />

        <div className="flex-1 min-w-0">
          <DebugLogPanel pageKey="node-specs" extra={{ clusterId, total: rows.length, statusFilter, roleFilter, search }} />

          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-4">
            <ClipboardCheck className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">노드 서버스펙 관리 대장</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
              {stats.total} 건
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => exportCsv(rows)} disabled={rows.length === 0}
                className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg flex items-center gap-1 disabled:opacity-50">
                <Download className="w-3 h-3" /> CSV
              </button>
              {clusterId && (
                importMut.isPending ? (
                  <button onClick={importMut.abort}
                    className="px-2.5 py-1 text-xs font-medium bg-red-500 hover:bg-red-600 text-primary-foreground rounded-lg flex items-center gap-1">
                    <Square className="w-3 h-3 fill-current" /> 중지
                  </button>
                ) : (
                  <button onClick={() => setConfirmImport(true)}
                    className="px-2.5 py-1 text-xs font-medium bg-sky-500/10 hover:bg-sky-500/20 text-sky-500 border border-sky-500/30 rounded-lg flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> 클러스터 임포트
                  </button>
                )
              )}
              <button onClick={() => setCreating(true)}
                className="px-3 py-1 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> 신규 등록
              </button>
            </div>
          </div>

          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {(['total', 'active', 'spare', 'maintenance', 'decommission'] as const).map((k) => (
              <div key={k} className="bg-card border border-border rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground">
                  {k === 'total' ? '전체' : STATUS_LABEL[k]}
                </p>
                <p className="text-2xl font-bold mt-0.5">{stats[k] ?? 0}</p>
              </div>
            ))}
          </div>

          {/* 필터 */}
          <div className="bg-card border border-border rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="hostname / serial / asset_tag / IP / vendor / model"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as NodeSpecStatus | '')}
              className="px-2 py-1 text-sm bg-background border border-border rounded-lg">
              <option value="">상태 전체</option>
              <option value="active">운영중</option>
              <option value="spare">예비</option>
              <option value="maintenance">점검</option>
              <option value="decommission">폐기</option>
            </select>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2 py-1 text-sm bg-background border border-border rounded-lg">
              <option value="">역할 전체</option>
              <option value="control-plane">control-plane</option>
              <option value="worker">worker</option>
              <option value="etcd">etcd</option>
              <option value="storage">storage</option>
              <option value="spare">spare</option>
            </select>
          </div>

          {/* 테이블 */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left sticky top-0">
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">호스트명</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">상태</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">클러스터/역할</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">IP / BMC</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">Vendor / Model</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">CPU / RAM</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">Disk / GPU</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">위치</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">자산</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading && (
                    <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> 로딩 중...
                    </td></tr>
                  )}
                  {!listQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                      등록된 서버가 없습니다. "클러스터 임포트" 또는 "신규 등록" 을 사용하세요.
                    </td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-2 py-2 font-mono text-xs text-foreground align-top">
                        <p className="font-semibold">{r.hostname}</p>
                        {r.nodeName && r.nodeName !== r.hostname && (
                          <p className="text-[10px] text-muted-foreground">k8s: {r.nodeName}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <p className="text-xs">{r.clusterName ?? <span className="text-muted-foreground/60">미배정</span>}</p>
                        <p className="text-[10px] text-muted-foreground">{r.role ?? '-'}</p>
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-[11px]">
                        <p className="text-foreground">{r.internalIp ?? '-'}</p>
                        {r.bmcIp && <p className="text-muted-foreground">BMC {r.bmcIp}</p>}
                        {(r.bond0Ip || r.bond1Ip) && (
                          <p className="text-muted-foreground/80 text-[10px]">
                            {r.bond0Ip && `bond0 ${r.bond0Ip}`}{r.bond0Ip && r.bond1Ip ? ' · ' : ''}{r.bond1Ip && `bond1 ${r.bond1Ip}`}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        <p className="font-medium">{r.vendor ?? '-'}</p>
                        <p className="text-muted-foreground">{r.model ?? '-'}</p>
                        {r.serialNumber && <p className="text-[10px] font-mono text-muted-foreground/70">SN: {r.serialNumber}</p>}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        <p className="font-mono">
                          <Cpu className="w-3 h-3 inline mr-0.5 text-muted-foreground" />
                          {r.cpuSockets ? `${r.cpuSockets}소켓 · ` : ''}
                          {r.cpuCores != null ? `${r.cpuCores}c` : '?'}
                          {r.cpuThreads ? `/${r.cpuThreads}t` : ''}
                        </p>
                        <p className="text-muted-foreground text-[10px] truncate max-w-[180px]" title={r.cpuModel ?? ''}>
                          {r.cpuModel ?? '-'}
                        </p>
                        <p className="font-mono">RAM {r.memoryGb ? `${r.memoryGb}GB` : '-'}</p>
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        <p className="font-mono">
                          <HardDrive className="w-3 h-3 inline mr-0.5 text-muted-foreground" />
                          {r.diskTotalGb ? `${r.diskTotalGb}GB` : '-'}
                          {r.diskType ? ` ${r.diskType}` : ''}
                          {r.diskCount ? ` ×${r.diskCount}` : ''}
                        </p>
                        {r.gpuModel && (
                          <p className="text-[10px] text-muted-foreground">
                            GPU {r.gpuCount ? `${r.gpuCount}× ` : ''}{r.gpuModel}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {(r.datacenter || r.rack || r.rackUnit) ? (
                          <p className="font-mono text-foreground">
                            <MapPin className="w-3 h-3 inline mr-0.5 text-muted-foreground" />
                            {[r.datacenter, r.room, r.rack, r.rackUnit].filter(Boolean).join('/')}
                          </p>
                        ) : <span className="text-muted-foreground/60">-</span>}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {r.assetTag && <p className="font-mono">{r.assetTag}</p>}
                        {r.warrantyEnd && (
                          <p className="text-[10px] text-muted-foreground">~{r.warrantyEnd}</p>
                        )}
                        {r.owner && <p className="text-[10px] text-muted-foreground">{r.owner}</p>}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditTarget(r)} title="수정"
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete(r)} title="삭제"
                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
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

          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <Server className="w-3 h-3" />
            "클러스터 임포트" 는 kubeconfig 로 hostname / IP / CPU / RAM / OS / kernel 등을 자동 채웁니다.
            벤더/시리얼/랙/자산태그 등은 수기로 입력하세요.
          </p>
        </div>
      </main>

      {(editTarget || creating) && (
        <NodeSpecEditModal
          mode={creating ? 'create' : 'edit'}
          spec={editTarget}
          defaultClusterId={clusterId}
          clusters={clusters}
          onClose={() => { setEditTarget(null); setCreating(false); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['node-specs'] });
            setEditTarget(null);
            setCreating(false);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmImport}
        title="클러스터 노드 임포트"
        description="kubeconfig 로 노드 메타데이터를 가져와 신규 등록 또는 자동수집 필드만 갱신합니다 (벤더/자산태그 등은 보존)."
        onCancel={() => setConfirmImport(false)}
        onConfirm={() => { setConfirmImport(false); importMut.mutate(); }}
      >
        <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
          <div>cluster: {clusters.find((c) => c.id === clusterId)?.name ?? clusterId}</div>
          <div>upsert : true · 보존 필드: vendor, model, serial, asset_tag, rack, ...</div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="서버스펙 삭제"
        description={`"${confirmDelete?.hostname}" 자산 정보를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default NodeSpecPage;
