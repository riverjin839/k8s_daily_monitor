import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, Plus, Search, RefreshCw, Download, Upload, Trash2, Pencil,
  Server, Cpu, HardDrive, MapPin, Loader2, Square, Copy, ClipboardPaste, FileDown,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import {
  ClusterSidebar, DebugLogPanel, ConfirmDialog, GridCell, InlineTextCell,
} from '@/components/common';
import { useAbortableMutation } from '@/hooks/useAbortableMutation';
import { useGridSelection } from '@/hooks/useGridSelection';
import { nodeSpecsApi } from '@/services/api';
import type { NodeServerSpec, NodeSpecStatus } from '@/types';
import { NodeSpecEditModal } from '@/components/node-specs/NodeSpecEditModal';
import { NodeSpecCsvUploadModal } from '@/components/node-specs/NodeSpecCsvUploadModal';
import { NodeSpecPasteModal } from '@/components/node-specs/NodeSpecPasteModal';
import { EXPORT_COLUMNS, NODE_SPEC_COLUMNS, serializeCellValue } from '@/components/node-specs/columns';

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

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(rows: NodeServerSpec[]) {
  const cols = EXPORT_COLUMNS;
  const header = cols.map((c) => c.csvKey).join(',');
  const body = rows.map((r) =>
    cols.map((c) => csvEscape(serializeCellValue(r[c.field], c))).join(','),
  ).join('\n');
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

function downloadCsvTemplate() {
  const header = EXPORT_COLUMNS.map((c) => c.csvKey).join(',');
  const example = EXPORT_COLUMNS.map((c) => {
    if (c.field === 'hostname') return 'srv-master-01';
    if (c.field === 'osImage') return 'RHEL9';
    if (c.field === 'diskTotalGb') return '18';
    if (c.field === 'isSsd') return 'O';
    if (c.field === 'isVm') return 'X';
    if (c.field === 'currentUsage') return 'NEW K8S MASTER';
    if (c.field === 'purchasePurpose') return '장비 분석용';
    return '';
  }).join(',');
  const blob = new Blob(['﻿', `${header}\n${example}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'node-server-specs-template.csv';
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
  const [csvOpen, setCsvOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

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

  // ── Grid 블록 선택 + 복사 ────────────────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null);
  const GRID_COLS = useMemo(() => [
    'hostname', 'status', 'cluster', 'ip', 'vendor', 'cpu', 'disk',
    'os', 'ssdvm', 'usage', 'location', 'asset',
  ], []);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const cellText = (coord: { row: string; col: string }): string | undefined => {
    const r = rows.find((x) => x.id === coord.row);
    if (!r) return undefined;
    switch (coord.col) {
      case 'hostname': return r.hostname;
      case 'status': return r.status;
      case 'cluster': return `${r.clusterName ?? ''}${r.role ? ` (${r.role})` : ''}`;
      case 'ip': return [r.internalIp, r.bmcIp && `BMC ${r.bmcIp}`].filter(Boolean).join(' · ');
      case 'vendor': return [r.vendor, r.model, r.serialNumber].filter(Boolean).join(' ');
      case 'cpu': return `${r.cpuSockets ?? ''}s/${r.cpuCores ?? ''}c/${r.cpuThreads ?? ''}t ${r.memoryGb ?? ''}GB`;
      case 'disk': return `${r.diskTotalGb ?? ''}GB ${r.diskType ?? ''}${r.gpuModel ? ` · GPU ${r.gpuModel}` : ''}`;
      case 'os': return r.osImage ?? '';
      case 'ssdvm': return `SSD:${r.isSsd === true ? 'O' : r.isSsd === false ? 'X' : '-'} VM:${r.isVm === true ? 'O' : r.isVm === false ? 'X' : '-'}`;
      case 'usage': return [r.currentUsage, r.purchasePurpose].filter(Boolean).join(' / ');
      case 'location': return [r.datacenter, r.room, r.rack, r.rackUnit].filter(Boolean).join('/');
      case 'asset': return [r.assetTag, r.warrantyEnd ? `~${r.warrantyEnd}` : '', r.owner].filter(Boolean).join(' · ');
      default: return '';
    }
  };

  const selection = useGridSelection({
    rowIds,
    colKeys: GRID_COLS,
    getCellText: cellText,
    containerRef: tableRef,
  });

  // ── 전역 paste — 테이블 내 셀이 선택된 상태에서 Ctrl+V 하면 붙여넣기 모달 ──
  const [pasteInitialText, setPasteInitialText] = useState<string>('');
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      // 편집 중인 input/textarea 에 붙여넣는 건 건드리지 않음
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      // 현재 페이지에 있을 때만 (테이블 또는 body 포커스)
      const active = document.activeElement;
      const inTable = active && (active === document.body || tableRef.current?.contains(active));
      if (!inTable) return;
      const txt = e.clipboardData?.getData('text/plain') ?? '';
      if (!txt.trim() || (!txt.includes('\t') && !txt.includes(','))) return;
      e.preventDefault();
      setPasteInitialText(txt);
      setPasteOpen(true);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, []);

  // 인라인 셀 편집 저장
  const saveField = async (id: string, patch: Partial<NodeServerSpec>) => {
    try {
      await nodeSpecsApi.update(id, patch);
      qc.invalidateQueries({ queryKey: ['node-specs'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      alert(`저장 실패: ${err.response?.data?.detail ?? err.message}`);
    }
  };

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
                <Download className="w-3 h-3" /> CSV 내보내기
              </button>
              <button onClick={downloadCsvTemplate}
                className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg flex items-center gap-1"
                title="현재 테이블 컬럼 기준 빈 템플릿 다운로드">
                <FileDown className="w-3 h-3" /> 템플릿
              </button>
              <button onClick={() => setCsvOpen(true)}
                className="px-2.5 py-1 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded-lg flex items-center gap-1">
                <Upload className="w-3 h-3" /> CSV 업로드
              </button>
              <button onClick={() => setPasteOpen(true)}
                className="px-2.5 py-1 text-xs font-medium bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/30 rounded-lg flex items-center gap-1"
                title="엑셀/구글시트에서 복사한 블록 붙여넣기">
                <ClipboardPaste className="w-3 h-3" /> 엑셀 붙여넣기
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

          {/* 선택 상태 표시 */}
          {selection.rangeSize > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-primary/5 border border-primary/30 rounded-lg text-[11px]">
              <Copy className="w-3 h-3 text-primary" />
              <span className="text-primary font-medium">{selection.rangeSize}개 셀 선택됨</span>
              <span className="text-muted-foreground">
                · Ctrl+C (Cmd+C) 로 TSV 복사 · Esc 로 해제
              </span>
              <button onClick={selection.clear}
                className="ml-auto text-muted-foreground hover:text-foreground">
                해제
              </button>
            </div>
          )}

          {/* 테이블 */}
          <div ref={tableRef} tabIndex={-1} className="bg-card border border-border rounded-xl overflow-hidden">
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
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">OS</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground text-center">SSD / VM</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">현재 용도 / 구입 목적</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">위치</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground">자산</th>
                    <th className="px-2 py-2 text-[11px] font-semibold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading && (
                    <tr><td colSpan={13} className="text-center py-10 text-muted-foreground">
                      <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> 로딩 중...
                    </td></tr>
                  )}
                  {!listQ.isLoading && rows.length === 0 && (
                    <tr><td colSpan={13} className="text-center py-12 text-sm text-muted-foreground">
                      등록된 서버가 없습니다. "클러스터 임포트" 또는 "신규 등록" 을 사용하세요.
                    </td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/10">
                      <GridCell row={r.id} col="hostname" selection={selection}
                        className="px-2 py-2 font-mono text-xs text-foreground align-top">
                        <p className="font-semibold">{r.hostname}</p>
                        {r.nodeName && r.nodeName !== r.hostname && (
                          <p className="text-[10px] text-muted-foreground">k8s: {r.nodeName}</p>
                        )}
                      </GridCell>
                      <GridCell row={r.id} col="status" selection={selection}
                        className="px-2 py-2 align-top">
                        <StatusBadge status={r.status} />
                      </GridCell>
                      <GridCell row={r.id} col="cluster" selection={selection}
                        className="px-2 py-2 align-top">
                        <p className="text-xs">{r.clusterName ?? <span className="text-muted-foreground/60">미배정</span>}</p>
                        <p className="text-[10px] text-muted-foreground">{r.role ?? '-'}</p>
                      </GridCell>
                      <GridCell row={r.id} col="ip" selection={selection}
                        className="px-2 py-2 align-top font-mono text-[11px]">
                        <p className="text-foreground">{r.internalIp ?? '-'}</p>
                        {r.bmcIp && <p className="text-muted-foreground">BMC {r.bmcIp}</p>}
                        {(r.bond0Ip || r.bond1Ip) && (
                          <p className="text-muted-foreground/80 text-[10px]">
                            {r.bond0Ip && `bond0 ${r.bond0Ip}`}{r.bond0Ip && r.bond1Ip ? ' · ' : ''}{r.bond1Ip && `bond1 ${r.bond1Ip}`}
                          </p>
                        )}
                      </GridCell>
                      <GridCell row={r.id} col="vendor" selection={selection}
                        className="px-2 py-2 align-top text-xs">
                        <p className="font-medium">
                          <InlineTextCell value={r.vendor ?? ''} placeholder="Dell / HPE"
                            onSave={(v) => saveField(r.id, { vendor: v })} />
                        </p>
                        <p className="text-muted-foreground">
                          <InlineTextCell value={r.model ?? ''} placeholder="PowerEdge R750"
                            onSave={(v) => saveField(r.id, { model: v })} />
                        </p>
                        {r.serialNumber && <p className="text-[10px] font-mono text-muted-foreground/70">SN: {r.serialNumber}</p>}
                      </GridCell>
                      <GridCell row={r.id} col="cpu" selection={selection}
                        className="px-2 py-2 align-top text-xs">
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
                      </GridCell>
                      <GridCell row={r.id} col="disk" selection={selection}
                        className="px-2 py-2 align-top text-xs">
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
                      </GridCell>
                      <GridCell row={r.id} col="os" selection={selection}
                        className="px-2 py-2 align-top text-xs font-mono max-w-[200px]">
                        <p className="truncate" title={r.osImage ?? ''}>
                          <InlineTextCell value={r.osImage ?? ''} placeholder="RHEL9"
                            onSave={(v) => saveField(r.id, { osImage: v })} />
                        </p>
                        {r.kernelVersion && (
                          <p className="text-[10px] text-muted-foreground truncate" title={r.kernelVersion}>
                            {r.kernelVersion}
                          </p>
                        )}
                      </GridCell>
                      <GridCell row={r.id} col="ssdvm" selection={selection}
                        className="px-2 py-2 align-top text-center">
                        <div className="flex items-center justify-center gap-2 text-sm font-mono">
                          <button
                            type="button"
                            title="SSD 여부 (클릭 순환)"
                            onClick={() => {
                              const next = r.isSsd === true ? false : r.isSsd === false ? null : true;
                              saveField(r.id, { isSsd: next });
                            }}
                            className={`px-1 rounded hover:bg-primary/10 ${
                              r.isSsd === true ? 'text-emerald-500 font-bold'
                              : r.isSsd === false ? 'text-muted-foreground/50'
                              : 'text-muted-foreground/30'
                            }`}
                          >
                            {r.isSsd === true ? 'O' : r.isSsd === false ? 'X' : '·'}
                          </button>
                          <span className="text-muted-foreground/30">/</span>
                          <button
                            type="button"
                            title="VM 여부 (클릭 순환)"
                            onClick={() => {
                              const next = r.isVm === true ? false : r.isVm === false ? null : true;
                              saveField(r.id, { isVm: next });
                            }}
                            className={`px-1 rounded hover:bg-primary/10 ${
                              r.isVm === true ? 'text-sky-500 font-bold'
                              : r.isVm === false ? 'text-muted-foreground/50'
                              : 'text-muted-foreground/30'
                            }`}
                          >
                            {r.isVm === true ? 'O' : r.isVm === false ? 'X' : '·'}
                          </button>
                        </div>
                      </GridCell>
                      <GridCell row={r.id} col="usage" selection={selection}
                        className="px-2 py-2 align-top text-xs max-w-[200px]">
                        <p className="font-medium truncate" title={r.currentUsage ?? ''}>
                          <InlineTextCell value={r.currentUsage ?? ''} placeholder="NEW K8S MASTER"
                            onSave={(v) => saveField(r.id, { currentUsage: v })} />
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate" title={r.purchasePurpose ?? ''}>
                          <InlineTextCell value={r.purchasePurpose ?? ''} placeholder="장비 분석용"
                            onSave={(v) => saveField(r.id, { purchasePurpose: v })} />
                        </p>
                      </GridCell>
                      <GridCell row={r.id} col="location" selection={selection}
                        className="px-2 py-2 align-top text-xs">
                        {(r.datacenter || r.rack || r.rackUnit) ? (
                          <p className="font-mono text-foreground">
                            <MapPin className="w-3 h-3 inline mr-0.5 text-muted-foreground" />
                            {[r.datacenter, r.room, r.rack, r.rackUnit].filter(Boolean).join('/')}
                          </p>
                        ) : <span className="text-muted-foreground/60">-</span>}
                      </GridCell>
                      <GridCell row={r.id} col="asset" selection={selection}
                        className="px-2 py-2 align-top text-xs">
                        <p className="font-mono">
                          <InlineTextCell value={r.assetTag ?? ''} placeholder="자산태그"
                            onSave={(v) => saveField(r.id, { assetTag: v })} />
                        </p>
                        {r.warrantyEnd && (
                          <p className="text-[10px] text-muted-foreground">~{r.warrantyEnd}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          <InlineTextCell value={r.owner ?? ''} placeholder="담당자"
                            onSave={(v) => saveField(r.id, { owner: v })} />
                        </p>
                      </GridCell>
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditTarget(r)} title="상세 수정 (모달)"
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

      <NodeSpecCsvUploadModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: ['node-specs'] });
        }}
      />

      <NodeSpecPasteModal
        open={pasteOpen}
        onClose={() => { setPasteOpen(false); setPasteInitialText(''); }}
        onApplied={() => {
          qc.invalidateQueries({ queryKey: ['node-specs'] });
        }}
        displayColumns={NODE_SPEC_COLUMNS}
        initialText={pasteInitialText}
      />
    </div>
  );
}

export default NodeSpecPage;
