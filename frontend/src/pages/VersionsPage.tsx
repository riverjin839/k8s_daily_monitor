import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  GitCommit, RefreshCw, Square, Clock, Share2, X, ChevronDown, ChevronUp,
  Server, Cpu, Network, Settings2, HardDrive,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { ClusterSidebar, DebugLogPanel, useToast, EmptyState, SkeletonCard } from '@/components/common';
import { formatApiError } from '@/lib/utils';
import { versionsApi, type ComponentSnapshot } from '@/services/api';
import { useAbortableMutation } from '@/hooks/useAbortableMutation';
import { EtcdSystemdModal, KernelParamsCollectModal, NodeNicsCollectModal } from '@/components/versions';
import { Database } from 'lucide-react';

// ── 유틸 ────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  control_plane: { label: 'Control Plane', icon: Server,     cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  kubelet:       { label: 'Kubelet',        icon: Cpu,        cls: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  cni:           { label: 'CNI / Cilium',   icon: Network,    cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  // OS 레벨 — kernel sysctl · etcd systemd · etcdctl config 를 한 카테고리로.
  os:            { label: 'OS',              icon: Cpu,        cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  // Storage — MinIO / AIStor / DirectPV 등 객체스토리지 레이어
  storage:       { label: 'Storage (S3/MinIO)', icon: HardDrive, cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  cluster:       { label: 'Cluster',        icon: Server,     cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
  other:         { label: 'Other',          icon: Settings2,  cls: 'bg-muted text-muted-foreground border-border' },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Component detail (flags / data) ─────────────────────────────────────────

function ComponentDetails({ snap }: { snap: ComponentSnapshot }) {
  const data = snap.data as Record<string, unknown>;
  const flags = (data?.flags && typeof data.flags === 'object') ? data.flags as Record<string, string> : null;
  const image = typeof data?.image === 'string' ? data.image : null;
  const cmData = (data?.data && typeof data.data === 'object') ? data.data as Record<string, string> : null;

  // MinIO Tenant / DirectPV 전용 디테일 — pool/EC 등 운영 핵심 표시
  if (snap.component.startsWith('minio_tenant:')) {
    return <MinioTenantDetails data={data} />;
  }
  if (snap.component === 'directpv_summary') {
    return <DirectPVDetails data={data} />;
  }

  return (
    <div className="space-y-3 text-xs">
      {image && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Image</p>
          <p className="font-mono text-foreground break-all">{image}</p>
        </div>
      )}
      {flags && Object.keys(flags).length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Flags ({Object.keys(flags).length})</p>
          <div className="max-h-60 overflow-y-auto space-y-0.5 rounded-md bg-muted/30 p-2">
            {Object.entries(flags).sort().map(([k, v]) => (
              <div key={k} className="font-mono text-[11px] break-all">
                <span className="text-primary">--{k}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-foreground/80">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {cmData && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">ConfigMap data ({Object.keys(cmData).length})</p>
          <div className="max-h-60 overflow-y-auto space-y-0.5 rounded-md bg-muted/30 p-2">
            {Object.entries(cmData).sort().map(([k, v]) => (
              <div key={k} className="font-mono text-[11px] break-all">
                <span className="text-primary">{k}</span>:{' '}
                <span className="text-foreground/80">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 나머지 원시 필드 (kubeletVersion, kernel 등) */}
      {!flags && !cmData && Object.keys(data || {}).length > 0 && (
        <div className="space-y-0.5 rounded-md bg-muted/30 p-2">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="font-mono text-[11px] break-all">
              <span className="text-primary">{k}</span>:{' '}
              <span className="text-foreground/80">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MinIO Tenant / DirectPV 전용 디테일 ───────────────────────────────────

function MinioTenantDetails({ data }: { data: Record<string, unknown> }) {
  const pools = Array.isArray(data?.pools) ? data.pools as Array<Record<string, unknown>> : [];
  const num = (k: string) => typeof data?.[k] === 'number' ? data[k] as number : null;
  const str = (k: string) => typeof data?.[k] === 'string' ? data[k] as string : null;
  const totalServers  = num('totalServers');
  const totalDrives   = num('totalDrives');
  const drivesPerSet  = num('drivesPerSet');
  const ecParity      = num('ecParity');
  const ecDataShards  = num('ecDataShards');
  const ecExplicit    = data?.ecExplicit === true;
  const requestAutoCert = data?.requestAutoCert === true;
  const ecRatio = (drivesPerSet && ecDataShards != null && ecParity != null && drivesPerSet > 0)
    ? `EC:${ecParity} (${ecDataShards} data + ${ecParity} parity / ${drivesPerSet})`
    : null;

  const stat = (label: string, value: React.ReactNode, color?: string) => (
    <div className="bg-muted/40 rounded-md px-2 py-1.5">
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`text-sm font-semibold font-mono ${color ?? 'text-foreground'}`}>{value ?? '-'}</p>
    </div>
  );

  return (
    <div className="space-y-3 text-xs">
      {str('image') && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Image</p>
          <p className="font-mono text-foreground break-all">{str('image')}</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {stat('서버 수',   totalServers,  'text-sky-500')}
        {stat('드라이브',  totalDrives,   'text-emerald-500')}
        {stat('Erasure Set', drivesPerSet)}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {stat('Parity (EC)', ecParity != null ? `${ecParity}${ecExplicit ? ' (명시)' : ' (default)'}` : '-', 'text-amber-500')}
        {stat('Data shards', ecDataShards)}
        {stat('Auto TLS', requestAutoCert ? 'Yes' : 'No', requestAutoCert ? 'text-emerald-500' : 'text-muted-foreground')}
      </div>
      {ecRatio && (
        <p className="text-[11px] font-mono text-emerald-500/80 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-2 py-1">
          {ecRatio} — 손실 허용 디스크: {ecParity}개
        </p>
      )}

      {pools.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-1 tracking-wider">
            Pools ({pools.length})
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">name</th>
                  <th className="px-2 py-1 font-medium">servers</th>
                  <th className="px-2 py-1 font-medium">vol/srv</th>
                  <th className="px-2 py-1 font-medium">drives</th>
                  <th className="px-2 py-1 font-medium">size</th>
                  <th className="px-2 py-1 font-medium">storageClass</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p, i) => (
                  <tr key={i} className="border-t border-border font-mono">
                    <td className="px-2 py-1">{String(p.name ?? `pool-${i}`)}</td>
                    <td className="px-2 py-1">{String(p.servers ?? '-')}</td>
                    <td className="px-2 py-1">{String(p.volumesPerServer ?? '-')}</td>
                    <td className="px-2 py-1 text-emerald-500">{String(p.drives ?? '-')}</td>
                    <td className="px-2 py-1">{String(p.volumeSize ?? '-')}</td>
                    <td className="px-2 py-1 truncate max-w-[140px]" title={String(p.storageClass ?? '')}>{String(p.storageClass ?? '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 상태 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {stat('currentState', str('currentState'))}
        {stat('health', str('healthStatus'))}
        {stat('online', num('drivesOnline'), 'text-emerald-500')}
        {stat('offline', num('drivesOffline'),
          (num('drivesOffline') ?? 0) > 0 ? 'text-red-500' : undefined)}
      </div>
    </div>
  );
}

function DirectPVDetails({ data }: { data: Record<string, unknown> }) {
  const num = (k: string) => typeof data?.[k] === 'number' ? data[k] as number : null;
  const nodes = Array.isArray(data?.nodes) ? data.nodes as Array<Record<string, unknown>> : [];
  const totalDrives = num('totalDrives') ?? 0;
  const readyDrives = num('readyDrives') ?? 0;
  const totalCap   = num('totalCapacity') ?? 0;
  const allocCap   = num('allocatedCapacity') ?? 0;
  const nodeCount  = num('nodeCount') ?? 0;
  const fmtBytes = (b: number) => {
    if (b <= 0) return '-';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0; let v = b;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(2)} ${u[i]}`;
  };

  const stat = (label: string, value: React.ReactNode, color?: string) => (
    <div className="bg-muted/40 rounded-md px-2 py-1.5">
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`text-sm font-semibold font-mono ${color ?? 'text-foreground'}`}>{value ?? '-'}</p>
    </div>
  );
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-3 gap-1.5">
        {stat('총 드라이브', totalDrives, 'text-emerald-500')}
        {stat('Ready', `${readyDrives} / ${totalDrives}`, readyDrives === totalDrives ? 'text-emerald-500' : 'text-amber-500')}
        {stat('노드 수', nodeCount, 'text-sky-500')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {stat('총 용량', fmtBytes(totalCap))}
        {stat('할당된 용량', fmtBytes(allocCap),
          (totalCap > 0 && allocCap / totalCap > 0.85) ? 'text-amber-500' : undefined)}
      </div>
      {nodes.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase mb-1 tracking-wider">
            Per-node ({nodes.length})
          </p>
          <div className="max-h-60 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">node</th>
                  <th className="px-2 py-1 font-medium">drives</th>
                  <th className="px-2 py-1 font-medium">ready</th>
                  <th className="px-2 py-1 font-medium">total</th>
                  <th className="px-2 py-1 font-medium">fs</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n, i) => (
                  <tr key={i} className="border-t border-border font-mono">
                    <td className="px-2 py-1 break-all">{String(n.node ?? '-')}</td>
                    <td className="px-2 py-1">{String(n.drives ?? '-')}</td>
                    <td className="px-2 py-1">{String(n.ready ?? '-')}</td>
                    <td className="px-2 py-1">{fmtBytes(Number(n.total ?? 0))}</td>
                    <td className="px-2 py-1">{Array.isArray(n.fsTypes) ? (n.fsTypes as string[]).join(', ') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History timeline for one component ──────────────────────────────────────

function HistoryTimeline({
  clusterId, component, onPickDiff,
}: {
  clusterId: string;
  component: string;
  onPickDiff: (from: ComponentSnapshot, to: ComponentSnapshot) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['versions', 'history', clusterId, component],
    queryFn: () => versionsApi.history(clusterId, component).then((r) => r.data),
    staleTime: 30_000,
  });
  const [pickedIds, setPicked] = useState<string[]>([]);

  const snapshots = useMemo(() => data?.snapshots ?? [], [data]);

  const togglePick = useCallback((id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [id, ...prev].slice(0, 2);
    });
  }, []);

  useEffect(() => {
    if (pickedIds.length === 2) {
      const [b, a] = pickedIds; // 선택한 순서 — 두 번째가 구(오래된)
      const from = snapshots.find((s) => s.id === a);
      const to = snapshots.find((s) => s.id === b);
      if (from && to) onPickDiff(from, to);
      setPicked([]);
    }
  }, [pickedIds, snapshots, onPickDiff]);

  if (isLoading) return <p className="text-xs text-muted-foreground px-4 py-3">불러오는 중…</p>;
  if (snapshots.length === 0) return <p className="text-xs text-muted-foreground px-4 py-3">히스토리 없음</p>;

  return (
    <div className="space-y-1 px-4 py-3">
      <p className="text-[10px] text-muted-foreground mb-2">
        두 개 선택 시 diff를 자동으로 표시합니다 (선택 {pickedIds.length}/2)
      </p>
      <div className="relative pl-4 border-l-2 border-border space-y-3">
        {snapshots.map((s) => {
          const picked = pickedIds.includes(s.id);
          return (
            <div key={s.id} className="relative">
              <span className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 ${
                picked ? 'bg-primary border-primary' : 'bg-background border-border'
              }`} />
              <button
                onClick={() => togglePick(s.id)}
                className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                  picked ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground">
                    {s.version || '(version 없음)'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDateTime(s.collectedAt)}
                  </span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Diff Panel ──────────────────────────────────────────────────────────────

function DiffPanel({
  clusterId, from, to, onClose,
}: {
  clusterId: string;
  from: ComponentSnapshot;
  to: ComponentSnapshot;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['versions', 'diff', clusterId, from.id, to.id],
    queryFn: () => versionsApi.diff(clusterId, from.id, to.id).then((r) => r.data),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold mb-0.5">
            <span className="text-muted-foreground">Diff: </span>
            <span className="font-mono">{from.component}</span>
          </h3>
          <p className="text-xs text-muted-foreground font-mono">
            {formatDateTime(from.collectedAt)} → {formatDateTime(to.collectedAt)}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">분석 중…</p>
      ) : data?.changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">변경 없음</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {data?.versionChanged && (
            <div className="text-xs font-mono px-2 py-1 bg-primary/10 text-primary border border-primary/30 rounded">
              version: {from.version} → {to.version}
            </div>
          )}
          {data?.changes.map((c, i) => (
            <div key={i} className="text-xs font-mono px-2 py-1 rounded bg-muted/30 border border-border">
              <p className="text-primary mb-0.5">{c.key}</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-red-400 break-all">- {String(c.from ?? '(없음)')}</div>
                <div className="text-emerald-400 break-all">+ {String(c.to ?? '(없음)')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 페이지 ──────────────────────────────────────────────────────────────

export function VersionsPage() {
  const queryClient = useQueryClient();
  const { data: clusters = [] } = useClusters();
  const toast = useToast();
  const [clusterId, setClusterId] = useState<string>('');
  const [etcdModalOpen, setEtcdModalOpen] = useState(false);
  const [kernelModalOpen, setKernelModalOpen] = useState(false);
  const [nicsModalOpen, setNicsModalOpen] = useState(false);

  // 사이드바 진입 시 자동으로 첫 클러스터 선택
  useEffect(() => {
    if (!clusterId && clusters.length > 0) setClusterId(clusters[0].id);
  }, [clusters, clusterId]);

  const { data: current, isLoading } = useQuery({
    queryKey: ['versions', 'current', clusterId],
    queryFn: () => versionsApi.current(clusterId).then((r) => r.data),
    enabled: !!clusterId,
    staleTime: 30_000,
  });

  const collect = useAbortableMutation({
    mutationFn: (_: void, signal) => versionsApi.collect(clusterId, signal),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['versions'] });
      const { changed, errors } = res.data;
      if (errors.length > 0) {
        toast.warning(`${changed}개 변경 감지됨 · 경고 ${errors.length}건`, errors.slice(0, 3).join('\n'));
      } else {
        toast.success(`${changed}개 변경 감지됨`, '스냅샷 갱신 완료');
      }
    },
    onError: (err: unknown) => {
      toast.error('수집 실패', formatApiError(err));
    },
  });

  const collectMinio = useAbortableMutation({
    mutationFn: (_: void, signal) => versionsApi.collectMinio(clusterId, signal),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['versions'] });
      const { changed, summary, warnings } = res.data;
      const tenants = summary.tenants?.length ?? 0;
      const op = summary.operator ? '운영자 OK' : '운영자 X';
      const directpv = summary.directpv ? `DirectPV ${summary.directpv.totalDrives}드라이브` : 'DirectPV X';
      const desc = `${op} · 테넌트 ${tenants}개 · ${directpv}`;
      if (changed > 0) {
        toast.success(`MinIO ${changed}건 변경 감지`, desc);
      } else if (tenants === 0 && !summary.operator) {
        toast.info('MinIO 미설치', warnings.slice(0, 2).join('\n') || '관련 리소스를 찾지 못했습니다.');
      } else {
        toast.info('MinIO 변경 없음', desc);
      }
    },
    onError: (err: unknown) => {
      toast.error('MinIO 수집 실패', formatApiError(err));
    },
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (comp: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(comp)) next.delete(comp);
    else next.add(comp);
    return next;
  });

  const [diffPair, setDiffPair] = useState<{ from: ComponentSnapshot; to: ComponentSnapshot } | null>(null);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, ComponentSnapshot[]>();
    for (const c of current?.components ?? []) {
      const key = c.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(c);
    }
    // control_plane 먼저, 그 다음 cni, kubelet, os, storage, other
    const order = ['control_plane', 'cni', 'kubelet', 'os', 'storage', 'other'];
    return order.filter((k) => byCategory.has(k)).map((k) => ({
      category: k,
      items: byCategory.get(k)!.sort((a, b) => a.component.localeCompare(b.component)),
    }));
  }, [current]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1800px] mx-auto px-6 py-6 flex gap-5">
        <ClusterSidebar
          clusters={clusters}
          selectedId={clusterId || null}
          onSelect={(id) => setClusterId(id ?? '')}
        />
        <div className="flex-1 min-w-0">
        <DebugLogPanel pageKey="versions" extra={{ clusterId, components: current?.components?.length ?? 0, pending: collect.isPending }} />
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <GitCommit className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">버전 / 설정 관리</h1>
            {clusterId && current?.components && (
              <>
                <span className="text-xs font-mono text-muted-foreground">· {clusters.find((c) => c.id === clusterId)?.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                  {current.components.length}개 컴포넌트
                </span>
              </>
            )}
          </div>
          {clusterId && (
            <div className="flex items-center gap-2">
              <Link
                to={`/versions/${clusterId}/graph`}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
                title="3D 관계 그래프"
              >
                <Share2 className="w-4 h-4" />
                3D 그래프
              </Link>
              <button
                onClick={() => setEtcdModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
                title="etcd (systemd) — SSH 로 수집"
              >
                <Database className="w-4 h-4" />
                etcd (systemd)
              </button>
              <button
                onClick={() => setKernelModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
                title="노드별 sysctl 커널 파라미터 — SSH 로 수집 (값 변경시 히스토리 누적)"
              >
                <Cpu className="w-4 h-4" />
                커널 파라미터
              </button>
              <button
                onClick={() => setNicsModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
                title="노드별 NIC / IP — SSH 로 수집 (bond0/bond1 + public/private 분류)"
              >
                <Network className="w-4 h-4" />
                노드 NIC
              </button>
              {collectMinio.isPending ? (
                <button
                  onClick={collectMinio.abort}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-primary-foreground rounded-lg transition-colors"
                  title="MinIO 수집 중지"
                >
                  <Square className="w-4 h-4 fill-current" />
                  MinIO 중지
                </button>
              ) : (
                <button
                  onClick={() => collectMinio.mutate()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
                  title="MinIO Operator + Tenant + DirectPV 정보 수집 (pool/disk/parity)"
                >
                  <HardDrive className="w-4 h-4" />
                  MinIO
                </button>
              )}
              {collect.isPending ? (
                <button
                  onClick={collect.abort}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-primary-foreground rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  중지
                </button>
              ) : (
                <button
                  onClick={() => collect.mutate()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  지금 수집
                </button>
              )}
            </div>
          )}
        </div>

        {!clusterId && clusters.length === 0 && (
          <p className="text-center text-muted-foreground py-20">등록된 클러스터가 없습니다.</p>
        )}

        {/* 선택된 클러스터 상세 */}
        {clusterId && (
          <>
            <div className="bg-card border border-border rounded-xl p-4 mb-5 text-xs text-muted-foreground leading-relaxed">
              kubeconfig 를 통해 K8s/Cilium 버전, core component image tag, command/args 플래그, cilium-config ConfigMap 을 수집합니다.
              동일 hash 가 감지되면 저장하지 않으므로 반복 실행해도 안전. 변경이 발생한 시점에만 히스토리에 새 레코드가 생깁니다.
            </div>
          </>
        )}

        {/* 본문 */}
        {!clusterId ? null : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (current?.components.length ?? 0) === 0 ? (
          <EmptyState
            icon={Clock}
            title="아직 수집된 스냅샷이 없습니다"
            description="kubeconfig 에 연결해 현재 K8s 버전/설정을 스냅샷으로 저장합니다."
            action={{ label: '지금 수집', onClick: () => collect.mutate() }}
          />
        ) : (
          <div className="space-y-5">
            {grouped.map(({ category, items }) => {
              const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
              const Icon = meta.icon;
              return (
                <section key={category} className="bg-card border border-border rounded-xl overflow-hidden">
                  <header className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">{meta.label}</h2>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>
                      {items.length}
                    </span>
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((snap) => {
                      const isOpen = expanded.has(snap.component);
                      return (
                        <li key={snap.component}>
                          <button
                            onClick={() => toggle(snap.component)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                       : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                              <span className="font-mono text-sm text-foreground truncate">{snap.component}</span>
                              {snap.version && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                                  {snap.version}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0 ml-2">
                              {formatDateTime(snap.collectedAt)}
                            </span>
                          </button>
                          {isOpen && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border border-t border-border bg-muted/10">
                              <div className="px-5 py-4">
                                <p className="text-[10px] text-muted-foreground uppercase mb-2 tracking-wider">현재 값</p>
                                <ComponentDetails snap={snap} />
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase px-4 pt-4 tracking-wider">히스토리</p>
                                <HistoryTimeline
                                  clusterId={clusterId}
                                  component={snap.component}
                                  onPickDiff={(from, to) => setDiffPair({ from, to })}
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}

            {diffPair && (
              <DiffPanel
                clusterId={clusterId}
                from={diffPair.from}
                to={diffPair.to}
                onClose={() => setDiffPair(null)}
              />
            )}
          </div>
        )}
        </div>
      </main>

      <EtcdSystemdModal
        open={etcdModalOpen && !!clusterId}
        clusterId={clusterId}
        onClose={() => setEtcdModalOpen(false)}
      />
      <KernelParamsCollectModal
        open={kernelModalOpen && !!clusterId}
        clusterId={clusterId}
        onClose={() => setKernelModalOpen(false)}
      />
      <NodeNicsCollectModal
        open={nicsModalOpen && !!clusterId}
        clusterId={clusterId}
        onClose={() => {
          setNicsModalOpen(false);
          // Cluster 정보 (node_ips) 가 갱신됐을 수 있으므로 클러스터 캐시 무효화
          queryClient.invalidateQueries({ queryKey: ['clusters'] });
        }}
      />
    </div>
  );
}
