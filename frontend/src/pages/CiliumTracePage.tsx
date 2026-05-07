import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Server,
  Trash2,
  Waves,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { ClusterSidebar } from '@/components/common';
import { MacCard } from '@/components/ui/MacCard';
import { getAuthToken } from '@/stores/authStore';
import api from '@/services/api';

// ── Types (kept inline; this is the only consumer) ──────────────────────────
interface CiliumStatus {
  clusterId: string;
  ciliumInstalled: boolean;
  hubbleRelayInstalled: boolean;
  agentCount: number;
  ciliumVersion?: string | null;
  namespace: string;
  error?: string | null;
}
interface CiliumAgent {
  podName: string;
  namespace: string;
  nodeName?: string | null;
  nodeIp?: string | null;
  ready: boolean;
}
interface CiliumAgentsResponse {
  clusterId: string;
  agents: CiliumAgent[];
  error?: string | null;
}
type BpfKind =
  | 'endpoint' | 'lb' | 'nat' | 'ct' | 'tunnel'
  | 'policy' | 'fs' | 'metrics' | 'ipcache' | 'node';

interface BpfInspectResponse {
  clusterId: string;
  kind: string;
  podName: string;
  raw: string;
  parsed?: Record<string, unknown>[] | Record<string, unknown> | null;
  isJson: boolean;
  error?: string | null;
  executed?: string | null;
}

const BPF_KINDS: { id: BpfKind; label: string; desc: string }[] = [
  { id: 'endpoint', label: 'Endpoints',    desc: 'cilium-dbg bpf endpoint list' },
  { id: 'lb',       label: 'LB / Services', desc: 'bpf lb list' },
  { id: 'nat',      label: 'NAT',          desc: 'bpf nat list' },
  { id: 'ct',       label: 'Conntrack',    desc: 'bpf ct list global' },
  { id: 'tunnel',   label: 'Tunnels',      desc: 'bpf tunnel list' },
  { id: 'ipcache',  label: 'IP Cache',     desc: 'bpf ipcache list' },
  { id: 'node',     label: 'Nodes',        desc: 'bpf node list' },
  { id: 'metrics',  label: 'Metrics',      desc: 'bpf metrics list' },
  { id: 'fs',       label: 'BPF FS',       desc: 'bpf fs show' },
  { id: 'policy',   label: 'Policy (per-EP)', desc: 'bpf policy get <id>' },
];

// ── API helpers ─────────────────────────────────────────────────────────────
const ciliumApi = {
  status: (clusterId: string) =>
    api.get<CiliumStatus>(`/cilium/${clusterId}/status`).then((r) => r.data),
  agents: (clusterId: string) =>
    api.get<CiliumAgentsResponse>(`/cilium/${clusterId}/agents`).then((r) => r.data),
  bpfInspect: (clusterId: string, body: { kind: BpfKind; podName?: string; namespace?: string; endpointId?: string }) =>
    api.post<BpfInspectResponse>(`/cilium/${clusterId}/bpf-inspect`, {
      cluster_id: clusterId,
      kind: body.kind,
      pod_name: body.podName,
      namespace: body.namespace ?? 'kube-system',
      endpoint_id: body.endpointId,
    }).then((r) => r.data),
};

// ── SSE stream helper (fetch-based, supports Authorization header) ──────────
interface SseStreamHandle {
  abort: () => void;
}

function startSseStream(
  url: string,
  onLine: (line: string) => void,
  onError: (err: string) => void,
): SseStreamHandle {
  const ac = new AbortController();
  const token = getAuthToken();
  fetch(url, {
    signal: ac.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (resp) => {
      if (!resp.ok) {
        onError(`서버 오류 ${resp.status}`);
        return;
      }
      if (!resp.body) {
        onError('스트림 본문이 비어있습니다.');
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) { done = true; break; }
        const value = chunk.value;
        buf += decoder.decode(value, { stream: true });
        // SSE event 구분: "\n\n"
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const ln of block.split('\n')) {
            if (ln.startsWith('data:')) onLine(ln.slice(5).trimStart());
          }
        }
      }
    })
    .catch((e) => {
      if (ac.signal.aborted) return;
      onError(e instanceof Error ? e.message : String(e));
    });
  return { abort: () => ac.abort() };
}

// ── Page ────────────────────────────────────────────────────────────────────

type TabId = 'bpf' | 'monitor' | 'hubble';

export function CiliumTracePage() {
  useClusters();
  const { clusters } = useClusterStore();
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedClusterId && clusters.length > 0) setSelectedClusterId(clusters[0].id);
  }, [clusters, selectedClusterId]);
  const [tab, setTab] = useState<TabId>('bpf');

  const cid = selectedClusterId ?? '';

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['cilium', 'status', cid],
    queryFn: () => ciliumApi.status(cid),
    enabled: !!cid,
    staleTime: 30_000,
  });
  const { data: agentsResp } = useQuery({
    queryKey: ['cilium', 'agents', cid],
    queryFn: () => ciliumApi.agents(cid),
    enabled: !!cid,
    staleTime: 30_000,
  });

  const agents = agentsResp?.agents ?? [];

  return (
    <div className="min-h-screen bg-background flex">
      <ClusterSidebar
        clusters={clusters}
        selectedId={selectedClusterId}
        onSelect={setSelectedClusterId}
        allowAll={false}
      />
      <main className="flex-1 min-w-0 px-4 lg:px-6 py-5 space-y-4 max-w-[1700px]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Waves className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">Cilium BPF Trace</h1>
              <p className="text-xs text-muted-foreground">BPF 맵 인스펙터 · cilium monitor · Hubble flow</p>
            </div>
          </div>
          <button
            onClick={() => refetchStatus()}
            disabled={statusLoading || !cid}
            className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            상태 새로고침
          </button>
        </div>

        {/* Status strip */}
        <StatusStrip status={status} loading={statusLoading} agentCount={agents.length} />

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-secondary rounded-xl p-0.5 w-fit">
          {([
            { id: 'bpf' as const,     label: 'BPF Inspector', icon: <Database className="w-3.5 h-3.5" /> },
            { id: 'monitor' as const, label: 'Cilium Monitor', icon: <Activity className="w-3.5 h-3.5" /> },
            { id: 'hubble' as const,  label: 'Hubble Flows',   icon: <Waves className="w-3.5 h-3.5" /> },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab body */}
        {!cid ? (
          <MacCard bodyPadding="p-10">
            <div className="text-center text-sm text-muted-foreground">왼쪽에서 클러스터를 선택하세요.</div>
          </MacCard>
        ) : tab === 'bpf' ? (
          <BpfInspectorTab clusterId={cid} agents={agents} />
        ) : tab === 'monitor' ? (
          <MonitorTab clusterId={cid} agents={agents} />
        ) : (
          <HubbleTab clusterId={cid} hubbleInstalled={status?.hubbleRelayInstalled ?? false} />
        )}
      </main>
    </div>
  );
}

// ── Status strip ────────────────────────────────────────────────────────────

interface StatusStripProps { status?: CiliumStatus; loading: boolean; agentCount: number }

function StatusStrip({ status, loading, agentCount }: StatusStripProps) {
  if (loading) {
    return <div className="h-20 rounded-2xl bg-secondary/40 animate-pulse" />;
  }
  if (!status) {
    return null;
  }
  if (status.error) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">상태 점검 중 문제가 발생했습니다.</p>
          <p className="text-xs text-muted-foreground">{status.error}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatusCell
        icon={<Boxes className="w-4 h-4" />}
        label="Cilium"
        value={status.ciliumInstalled ? '설치됨' : '미설치'}
        accent={status.ciliumInstalled ? 'text-emerald-500' : 'text-muted-foreground'}
        hint={status.ciliumVersion ?? undefined}
      />
      <StatusCell
        icon={<Server className="w-4 h-4" />}
        label="Agent Pods"
        value={agentCount}
        accent="text-primary"
        hint={`${status.namespace}`}
      />
      <StatusCell
        icon={<Waves className="w-4 h-4" />}
        label="Hubble Relay"
        value={status.hubbleRelayInstalled ? '활성' : '없음'}
        accent={status.hubbleRelayInstalled ? 'text-emerald-500' : 'text-muted-foreground'}
        hint={status.hubbleRelayInstalled ? 'svc/hubble-relay' : 'install required'}
      />
      <StatusCell
        icon={<Activity className="w-4 h-4" />}
        label="Trace 가용성"
        value={
          status.ciliumInstalled
            ? (status.hubbleRelayInstalled ? 'BPF + Hubble' : 'BPF only')
            : '미가용'
        }
        accent={status.ciliumInstalled ? 'text-foreground' : 'text-muted-foreground'}
      />
    </div>
  );
}

interface StatusCellProps { icon: React.ReactNode; label: string; value: string | number; accent?: string; hint?: string }
function StatusCell({ icon, label, value, accent = 'text-foreground', hint }: StatusCellProps) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-secondary flex items-center justify-center ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`text-base font-bold leading-tight ${accent}`}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground truncate">{hint}</p>}
      </div>
    </div>
  );
}

// ── Tab 1: BPF Inspector ────────────────────────────────────────────────────

function BpfInspectorTab({ clusterId, agents }: { clusterId: string; agents: CiliumAgent[] }) {
  const readyAgents = agents.filter((a) => a.ready);
  const [kind, setKind] = useState<BpfKind>('endpoint');
  const [podName, setPodName] = useState<string>('');
  const [endpointId, setEndpointId] = useState<string>('');
  const [data, setData] = useState<BpfInspectResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!podName && readyAgents.length > 0) setPodName(readyAgents[0].podName);
  }, [readyAgents, podName]);

  const run = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true); setError(null);
    try {
      const res = await ciliumApi.bpfInspect(clusterId, {
        kind,
        podName: podName || undefined,
        endpointId: kind === 'policy' ? (endpointId || undefined) : undefined,
      });
      setData(res);
      if (res.error) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [clusterId, kind, podName, endpointId]);

  const downloadRaw = () => {
    if (!data?.raw) return;
    const blob = new Blob([data.raw], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cilium-bpf-${kind}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <MacCard bodyPadding="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as BpfKind)}
              className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {BPF_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={podName}
              onChange={(e) => setPodName(e.target.value)}
              className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[260px]"
            >
              <option value="">자동 (첫 번째 ready agent)</option>
              {agents.map((a) => (
                <option key={a.podName} value={a.podName} disabled={!a.ready}>
                  {a.podName} {a.nodeName ? `· ${a.nodeName}` : ''} {a.ready ? '' : '(NotReady)'}
                </option>
              ))}
            </select>
          </div>
          {kind === 'policy' && (
            <input
              value={endpointId}
              onChange={(e) => setEndpointId(e.target.value)}
              placeholder="endpoint ID"
              className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 w-32"
            />
          )}
          <button
            onClick={run}
            disabled={loading || (kind === 'policy' && !endpointId)}
            className="px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 mac-shadow"
          >
            <Play className="w-3.5 h-3.5" />
            {loading ? '조회 중…' : '조회'}
          </button>
          {data?.raw && (
            <button
              onClick={downloadRaw}
              className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> 내보내기
            </button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {BPF_KINDS.find((k) => k.id === kind)?.desc}
          </span>
        </div>
      </MacCard>

      {/* Result */}
      <MacCard
        title={data ? `결과 · ${data.kind} · ${data.podName}` : '결과'}
        bodyPadding="p-0"
        className="overflow-hidden"
      >
        {error && (
          <div className="px-4 py-3 border-b border-border bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
        {!data && !loading && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            대상 BPF 맵을 선택하고 <kbd className="mx-1 px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px]">조회</kbd> 를 누르세요.
          </div>
        )}
        {loading && (
          <div className="text-center py-16 text-sm text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> cilium-dbg 실행 중…
          </div>
        )}
        {data && data.isJson && Array.isArray(data.parsed) && (
          <BpfJsonTable rows={data.parsed} />
        )}
        {data && (!data.isJson || !Array.isArray(data.parsed)) && data.raw && (
          <pre className="text-[11px] leading-snug font-mono px-4 py-3 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all bg-background">
            {data.raw}
          </pre>
        )}
      </MacCard>
    </div>
  );
}

function BpfJsonTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows.slice(0, 50)) Object.keys(r).forEach((k) => set.add(k));
    return Array.from(set);
  }, [rows]);
  if (rows.length === 0) {
    return <div className="text-center py-12 text-sm text-muted-foreground">결과가 비어있습니다.</div>;
  }
  return (
    <div className="overflow-auto max-h-[60vh]">
      <table className="text-xs w-full border-collapse">
        <thead className="sticky top-0 bg-card">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left px-3 py-2 border-b border-border font-semibold uppercase tracking-wide text-[10px] text-muted-foreground whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-secondary/15'}>
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 border-b border-border/40 align-top max-w-[320px]">
                  <span className="block truncate font-mono text-[11px]" title={String(r[c] ?? '')}>
                    {formatCell(r[c])}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

// ── Tab 2: Cilium Monitor stream ─────────────────────────────────────────────

const MONITOR_TYPES = ['drop', 'trace', 'capture', 'debug', 'recorder', 'agent', 'l7'] as const;
type MonitorType = typeof MONITOR_TYPES[number];

interface MonitorEvent {
  ts: number;
  raw: string;
  kind?: string;
  parsed?: Record<string, unknown>;
}

function MonitorTab({ clusterId, agents }: { clusterId: string; agents: CiliumAgent[] }) {
  const readyAgents = agents.filter((a) => a.ready);
  const [podName, setPodName] = useState<string>('');
  const [types, setTypes] = useState<Set<MonitorType>>(new Set(['drop', 'trace']));
  const [relatedTo, setRelatedTo] = useState<string>('');
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [filterText, setFilterText] = useState('');
  const handleRef = useRef<SseStreamHandle | null>(null);
  const eventBuffer = useRef<MonitorEvent[]>([]);
  const flushTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!podName && readyAgents.length > 0) setPodName(readyAgents[0].podName);
  }, [readyAgents, podName]);

  // 모든 stream 종료
  useEffect(() => {
    return () => {
      handleRef.current?.abort();
      if (flushTimer.current) window.clearInterval(flushTimer.current);
    };
  }, []);

  const start = () => {
    if (!podName) { setErr('agent pod 가 필요합니다.'); return; }
    handleRef.current?.abort();
    setEvents([]);
    setErr(null);
    setRunning(true);
    setPaused(false);

    const params = new URLSearchParams({
      pod_name: podName,
      ...(types.size > 0 ? { types: Array.from(types).join(',') } : {}),
      ...(relatedTo ? { related_to: relatedTo } : {}),
    });
    const url = `/api/v1/cilium/${clusterId}/monitor/stream?${params.toString()}`;

    handleRef.current = startSseStream(
      url,
      (line) => {
        let parsed: Record<string, unknown> | undefined;
        try { parsed = JSON.parse(line); } catch { /* keep raw */ }
        const kind = (parsed && typeof parsed.kind === 'string') ? (parsed.kind as string) : undefined;
        eventBuffer.current.push({ ts: Date.now(), raw: line, kind, parsed });
      },
      (e) => {
        setErr(e);
        setRunning(false);
      },
    );

    // 60ms throttled flush — UI 가 폭주 안 하도록
    if (flushTimer.current) window.clearInterval(flushTimer.current);
    flushTimer.current = window.setInterval(() => {
      if (paused || eventBuffer.current.length === 0) return;
      setEvents((prev) => {
        const next = [...prev, ...eventBuffer.current];
        eventBuffer.current = [];
        return next.length > 1000 ? next.slice(next.length - 1000) : next;
      });
    }, 80);
  };

  const stop = () => {
    handleRef.current?.abort();
    handleRef.current = null;
    setRunning(false);
  };

  const clear = () => { setEvents([]); eventBuffer.current = []; };

  const filtered = useMemo(() => {
    if (!filterText.trim()) return events;
    const q = filterText.toLowerCase();
    return events.filter((e) => e.raw.toLowerCase().includes(q));
  }, [events, filterText]);

  return (
    <div className="space-y-4">
      <MacCard bodyPadding="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={podName}
              onChange={(e) => setPodName(e.target.value)}
              disabled={running}
              className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 min-w-[260px] focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            >
              {agents.map((a) => (
                <option key={a.podName} value={a.podName} disabled={!a.ready}>
                  {a.podName} {a.nodeName ? `· ${a.nodeName}` : ''} {a.ready ? '' : '(NotReady)'}
                </option>
              ))}
            </select>
          </div>
          <TypeFilter types={types} setTypes={setTypes} disabled={running} />
          <input
            value={relatedTo}
            onChange={(e) => setRelatedTo(e.target.value)}
            disabled={running}
            placeholder="related-to (endpoint id)"
            className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          {!running ? (
            <button
              onClick={start}
              className="px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors flex items-center gap-1.5 mac-shadow"
            >
              <Play className="w-3.5 h-3.5" /> 시작
            </button>
          ) : (
            <button
              onClick={stop}
              className="px-3.5 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> 중단
            </button>
          )}
          <button
            onClick={() => setPaused((p) => !p)}
            disabled={!running}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? '재개' : '일시정지'}
          </button>
          <button
            onClick={clear}
            disabled={events.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> 비우기
          </button>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            <span className={running ? 'text-emerald-500' : ''}>●</span> {events.length}건
          </span>
        </div>
      </MacCard>

      {err && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {err}
        </div>
      )}

      <MacCard
        title="실시간 이벤트"
        bodyPadding="p-0"
        className="overflow-hidden"
      >
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="텍스트로 필터링…"
            className="flex-1 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <EventList events={filtered} />
      </MacCard>
    </div>
  );
}

function TypeFilter({ types, setTypes, disabled }: { types: Set<MonitorType>; setTypes: (s: Set<MonitorType>) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = types.size === 0 ? '모든 type' : Array.from(types).join(', ');
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 flex items-center gap-1.5 max-w-[260px]"
      >
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 w-56 bg-card border border-border rounded-xl mac-shadow p-2 space-y-1">
          {MONITOR_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-secondary cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary"
                checked={types.has(t)}
                onChange={(e) => {
                  const next = new Set(types);
                  if (e.target.checked) next.add(t); else next.delete(t);
                  setTypes(next);
                }}
              />
              {t}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function EventList({ events }: { events: MonitorEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  // 자동 스크롤
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        이벤트가 없습니다. 시작 버튼을 누르거나 잠시 기다려 주세요.
      </div>
    );
  }
  return (
    <div ref={ref} className="overflow-auto max-h-[60vh] font-mono text-[11px] leading-snug bg-background">
      {events.map((e, i) => (
        <div
          key={i}
          className={`px-3 py-1.5 border-b border-border/30 hover:bg-secondary/30 ${
            e.kind === 'error' ? 'text-red-500' : e.kind === 'meta' ? 'text-muted-foreground' : ''
          }`}
        >
          <span className="text-muted-foreground/70 mr-2">{new Date(e.ts).toLocaleTimeString()}</span>
          <span className="break-all">{prettyEvent(e)}</span>
        </div>
      ))}
    </div>
  );
}

function prettyEvent(e: MonitorEvent): string {
  if (!e.parsed) return e.raw;
  const p = e.parsed as Record<string, unknown>;
  if (e.kind === 'meta') return `[meta] ${String(p.executed ?? e.raw)}`;
  if (e.kind === 'error') return `[error] ${String(p.data ?? e.raw)}`;
  // cilium monitor json 의 흔한 필드 요약
  const verdict = p.Verdict ?? p.verdict;
  const reason = p.reason ?? p.Reason ?? p.dropReason;
  const src = p.source ?? p.Source;
  const dst = p.destination ?? p.Destination;
  const summary = p.summary ?? p.Summary;
  const parts: string[] = [];
  if (verdict) parts.push(String(verdict));
  if (reason) parts.push(`reason=${String(reason)}`);
  if (src) parts.push(`src=${shortDesc(src)}`);
  if (dst) parts.push(`dst=${shortDesc(dst)}`);
  if (summary) parts.push(String(summary));
  return parts.length > 0 ? parts.join(' · ') : e.raw;
}

function shortDesc(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.podName ?? o.pod_name ?? o.namespace ?? o.identity ?? JSON.stringify(o));
  }
  return String(v);
}

// ── Tab 3: Hubble flow stream ───────────────────────────────────────────────

interface HubbleFlowEvent {
  ts: number;
  raw: string;
  parsed?: Record<string, unknown>;
}

function HubbleTab({ clusterId, hubbleInstalled }: { clusterId: string; hubbleInstalled: boolean }) {
  const [filters, setFilters] = useState({
    fromPod: '',
    toPod: '',
    fromNamespace: '',
    toNamespace: '',
    protocol: '',
    verdict: '',
  });
  const [events, setEvents] = useState<HubbleFlowEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const handleRef = useRef<SseStreamHandle | null>(null);
  const buffer = useRef<HubbleFlowEvent[]>([]);
  const flushTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.abort();
      if (flushTimer.current) window.clearInterval(flushTimer.current);
    };
  }, []);

  const start = () => {
    handleRef.current?.abort();
    setEvents([]);
    setErr(null);
    setRunning(true);
    setPaused(false);

    const params = new URLSearchParams();
    if (filters.fromPod)       params.set('from_pod', filters.fromPod);
    if (filters.toPod)         params.set('to_pod', filters.toPod);
    if (filters.fromNamespace) params.set('from_namespace', filters.fromNamespace);
    if (filters.toNamespace)   params.set('to_namespace', filters.toNamespace);
    if (filters.protocol)      params.set('protocol', filters.protocol);
    if (filters.verdict)       params.set('verdict', filters.verdict);

    const url = `/api/v1/cilium/${clusterId}/hubble/stream?${params.toString()}`;

    handleRef.current = startSseStream(
      url,
      (line) => {
        let parsed: Record<string, unknown> | undefined;
        try { parsed = JSON.parse(line); } catch { /* raw */ }
        buffer.current.push({ ts: Date.now(), raw: line, parsed });
      },
      (e) => { setErr(e); setRunning(false); },
    );

    if (flushTimer.current) window.clearInterval(flushTimer.current);
    flushTimer.current = window.setInterval(() => {
      if (paused || buffer.current.length === 0) return;
      setEvents((prev) => {
        const next = [...prev, ...buffer.current];
        buffer.current = [];
        return next.length > 1500 ? next.slice(next.length - 1500) : next;
      });
    }, 80);
  };

  const stop = () => { handleRef.current?.abort(); handleRef.current = null; setRunning(false); };
  const clear = () => { setEvents([]); buffer.current = []; };

  const verdictCounts = useMemo(() => {
    const c = { FORWARDED: 0, DROPPED: 0, AUDIT: 0, OTHER: 0 };
    for (const e of events) {
      const v = (e.parsed as Record<string, unknown> | undefined)?.flow as Record<string, unknown> | undefined;
      const verdict = String((v ?? e.parsed ?? {})?.verdict ?? '');
      if (verdict in c) c[verdict as keyof typeof c]++;
      else if (verdict) c.OTHER++;
    }
    return c;
  }, [events]);

  if (!hubbleInstalled) {
    return (
      <MacCard bodyPadding="p-8">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-500" />
          <p className="text-sm font-semibold">Hubble Relay 가 설치되어 있지 않습니다.</p>
          <p className="text-xs text-muted-foreground">
            <code className="px-1 py-0.5 rounded bg-secondary">cilium hubble enable --ui</code> 또는 helm 으로 hubble-relay 를 배포해 주세요.
          </p>
        </div>
      </MacCard>
    );
  }

  return (
    <div className="space-y-4">
      <MacCard bodyPadding="p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          {([
            { k: 'fromPod',       ph: 'from-pod (ns/name)' },
            { k: 'toPod',         ph: 'to-pod (ns/name)' },
            { k: 'fromNamespace', ph: 'from-namespace' },
            { k: 'toNamespace',   ph: 'to-namespace' },
            { k: 'protocol',      ph: 'protocol (tcp/udp/http/dns)' },
            { k: 'verdict',       ph: 'verdict (FORWARDED/DROPPED)' },
          ] as const).map((f) => (
            <input
              key={f.k}
              value={filters[f.k]}
              onChange={(e) => setFilters((s) => ({ ...s, [f.k]: e.target.value }))}
              disabled={running}
              placeholder={f.ph}
              className="text-xs bg-background border border-border rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {!running ? (
            <button
              onClick={start}
              className="px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors flex items-center gap-1.5 mac-shadow"
            >
              <Play className="w-3.5 h-3.5" /> 스트림 시작
            </button>
          ) : (
            <button
              onClick={stop}
              className="px-3.5 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> 중단
            </button>
          )}
          <button
            onClick={() => setPaused((p) => !p)}
            disabled={!running}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? '재개' : '일시정지'}
          </button>
          <button
            onClick={clear}
            disabled={events.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> 비우기
          </button>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <CheckCircle2 className="w-3 h-3" /> {verdictCounts.FORWARDED}
            </span>
            <span className="inline-flex items-center gap-1 text-red-500">
              <X className="w-3 h-3" /> {verdictCounts.DROPPED}
            </span>
            <span>전체 {events.length}</span>
          </div>
        </div>
      </MacCard>

      {err && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {err}
        </div>
      )}

      <MacCard title="Hubble flows" bodyPadding="p-0" className="overflow-hidden">
        <FlowList events={events} />
      </MacCard>
    </div>
  );
}

function FlowList({ events }: { events: HubbleFlowEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);
  if (events.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        flow 가 아직 없습니다. 시작 버튼을 눌러 hubble observe --follow 를 시작하세요.
      </div>
    );
  }
  return (
    <div ref={ref} className="overflow-auto max-h-[60vh] divide-y divide-border/40">
      {events.map((e, i) => {
        const flow = ((e.parsed?.flow as Record<string, unknown>) ?? e.parsed ?? {}) as Record<string, unknown>;
        const verdict = String(flow.verdict ?? '');
        const verdictClr =
          verdict === 'FORWARDED' ? 'text-emerald-500'
          : verdict === 'DROPPED' ? 'text-red-500'
          : verdict === 'AUDIT' ? 'text-amber-500' : 'text-muted-foreground';
        const summary = String(flow.Summary ?? flow.summary ?? '');
        const src = flow.source as Record<string, unknown> | undefined;
        const dst = flow.destination as Record<string, unknown> | undefined;
        const srcLabel = `${(src?.namespace as string) ?? '?'}/${(src?.pod_name as string) ?? '?'}`;
        const dstLabel = `${(dst?.namespace as string) ?? '?'}/${(dst?.pod_name as string) ?? '?'}`;
        const dropReason = flow.drop_reason_desc ?? flow.drop_reason;
        return (
          <div key={i} className="px-3 py-1.5 hover:bg-secondary/30 text-[11px] font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground/70 tabular-nums">{new Date(e.ts).toLocaleTimeString()}</span>
              <span className={`font-bold ${verdictClr}`}>{verdict || '?'}</span>
              {dropReason ? (
                <span className="text-red-500">[{String(dropReason)}]</span>
              ) : null}
              <span className="text-foreground">{srcLabel}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground">{dstLabel}</span>
            </div>
            {summary && <div className="text-muted-foreground truncate pl-1">{summary}</div>}
          </div>
        );
      })}
    </div>
  );
}
