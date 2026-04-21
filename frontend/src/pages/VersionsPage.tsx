import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  GitCommit, RefreshCw, Loader2, Clock, Share2, X, ChevronDown, ChevronUp,
  Server, Cpu, Network, Settings2,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { versionsApi, type ComponentSnapshot } from '@/services/api';

// ── 유틸 ────────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  control_plane: { label: 'Control Plane', icon: Server,     cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  kubelet:       { label: 'Kubelet',        icon: Cpu,        cls: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  cni:           { label: 'CNI / Cilium',   icon: Network,    cls: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
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
  const [clusterId, setClusterId] = useState<string>('');

  useEffect(() => {
    if (!clusterId && clusters.length > 0) setClusterId(clusters[0].id);
  }, [clusters, clusterId]);

  const { data: current, isLoading } = useQuery({
    queryKey: ['versions', 'current', clusterId],
    queryFn: () => versionsApi.current(clusterId).then((r) => r.data),
    enabled: !!clusterId,
    staleTime: 30_000,
  });

  const collect = useMutation({
    mutationFn: () => versionsApi.collect(clusterId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['versions'] });
      const { changed, errors } = res.data;
      const msg = `${changed}개 변경 감지됨.`;
      alert(errors.length > 0 ? `${msg}\n\n경고:\n${errors.join('\n')}` : msg);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(`수집 실패: ${e.response?.data?.detail ?? e.message ?? '알 수 없는 오류'}`);
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
    // control_plane 먼저, 그 다음 kubelet, cni
    const order = ['control_plane', 'cni', 'kubelet', 'other'];
    return order.filter((k) => byCategory.has(k)).map((k) => ({
      category: k,
      items: byCategory.get(k)!.sort((a, b) => a.component.localeCompare(b.component)),
    }));
  }, [current]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <GitCommit className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">버전 / 설정 관리</h1>
            {current?.components && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                {current.components.length}개 컴포넌트
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              className="px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Link
              to={clusterId ? `/versions/${clusterId}/graph` : '/versions'}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-foreground transition-colors"
              title="3D 관계 그래프"
            >
              <Share2 className="w-4 h-4" />
              3D 그래프
            </Link>
            <button
              onClick={() => collect.mutate()}
              disabled={!clusterId || collect.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50"
            >
              {collect.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              지금 수집
            </button>
          </div>
        </div>

        {/* 안내 */}
        <div className="bg-card border border-border rounded-xl p-4 mb-5 text-xs text-muted-foreground leading-relaxed">
          kubeconfig 를 통해 K8s/Cilium 버전, core component image tag, command/args 플래그, cilium-config ConfigMap 을 수집합니다.
          동일 hash 가 감지되면 저장하지 않으므로 반복 실행해도 안전. 변경이 발생한 시점에만 히스토리에 새 레코드가 생깁니다.
        </div>

        {/* 본문 */}
        {!clusterId ? (
          <p className="text-muted-foreground text-center py-20">클러스터를 선택하세요.</p>
        ) : isLoading ? (
          <p className="text-muted-foreground text-center py-20">불러오는 중…</p>
        ) : (current?.components.length ?? 0) === 0 ? (
          <div className="text-center py-20">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">아직 수집된 스냅샷이 없습니다.</p>
            <button
              onClick={() => collect.mutate()}
              disabled={collect.isPending}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50"
            >
              지금 수집
            </button>
          </div>
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
      </main>
    </div>
  );
}
