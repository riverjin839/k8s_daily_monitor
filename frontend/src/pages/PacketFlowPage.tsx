import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Box,
  Cloud,
  Globe,
  Loader2,
  Network,
  Route,
  Search,
  Server,
  Share2,
  Shield,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { usePacketFlow } from '@/hooks/usePacketFlow';
import type { PacketProtocol, TopologyTraceHop } from '@/types';

const HOP_STYLE: Record<string, { icon: typeof Globe; color: string; bg: string; border: string; label: string }> = {
  client:             { icon: Globe,   color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/40',     label: 'Client'            },
  dns:                { icon: Cloud,   color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/40',  label: 'DNS'               },
  ingress_controller: { icon: Shield,  color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/40',  label: 'Ingress Controller'},
  ingress:            { icon: Route,   color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/40',  label: 'Ingress'           },
  service:            { icon: Share2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', label: 'Service'           },
  pod:                { icon: Box,     color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/40',   label: 'Pod'               },
  node:               { icon: Server,  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/40',  label: 'Node'              },
  switch:             { icon: Network, color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/40',    label: 'Switch'            },
  link:               { icon: Network, color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/40',   label: 'Link'              },
};

function HopCard({ hop, index }: { hop: TopologyTraceHop; index: number }) {
  const style = HOP_STYLE[hop.entityType] ?? HOP_STYLE.link;
  const HopIcon = style.icon;
  const hasWarning = (hop.errorCount ?? 0) > 0;

  return (
    <div className={`flex-shrink-0 w-[240px] rounded-xl border ${style.border} ${style.bg} p-4 relative`}>
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
        {index + 1}
      </div>
      {hasWarning && (
        <AlertTriangle className="absolute top-3 right-3 w-4 h-4 text-amber-400" />
      )}
      <div className="flex items-center gap-2 mb-2">
        <HopIcon className={`w-4 h-4 flex-shrink-0 ${style.color}`} />
        <p className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>{style.label}</p>
      </div>
      <p className="text-sm font-semibold text-foreground truncate mb-1" title={hop.name}>
        {hop.name}
      </p>
      {hop.interface && (
        <p className="text-[11px] font-mono text-muted-foreground truncate" title={hop.interface}>
          {hop.interface}
        </p>
      )}
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/40">
        {hop.latencyMs !== null && hop.latencyMs !== undefined && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="w-3 h-3" />
            {hop.latencyMs.toFixed(1)}ms
          </span>
        )}
        {hop.errorCount !== null && hop.errorCount !== undefined && hop.errorCount > 0 && (
          <span className="text-[10px] text-amber-400 font-medium">
            errors: {hop.errorCount}
          </span>
        )}
      </div>
    </div>
  );
}

export function PacketFlowPage() {
  const { data: clustersData } = useClusters();
  const clusters = clustersData ?? [];
  const { mutate: traceFlow, isPending, data: result, error, reset } = usePacketFlow();

  const [clusterId, setClusterId] = useState('');
  const [host, setHost]     = useState('');
  const [path, setPath]     = useState('/');
  const [protocol, setProtocol] = useState<PacketProtocol>('https');

  const ic = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const lc = 'block text-xs font-medium text-muted-foreground mb-1';

  const canSubmit = !!clusterId && !!host.trim();

  const handleSubmit = () => {
    if (!canSubmit) return;
    reset();
    traceFlow({ clusterId, host: host.trim(), path: path.trim() || '/', protocol });
  };

  const errorMsg = (() => {
    if (!error) return null;
    const err = error as { response?: { data?: { detail?: string } }; message?: string };
    return err.response?.data?.detail ?? err.message ?? '추적에 실패했습니다';
  })();

  const totalLatency = result?.hops
    .map((h) => h.latencyMs ?? 0)
    .reduce((a, b) => a + b, 0);
  const errorHops = result?.hops.filter((h) => (h.errorCount ?? 0) > 0).length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <Route className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">E2E 패킷 흐름 분석</h1>
          <span className="text-xs text-muted-foreground">
            외부 클라이언트 → Ingress → Service → Pod → Node → Switch
          </span>
        </div>

        {/* 입력 패널 */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr_120px_auto] gap-3 items-end">
            <div>
              <label className={lc}>클러스터</label>
              <select value={clusterId} onChange={(e) => setClusterId(e.target.value)} className={ic}>
                <option value="">— 선택 —</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lc}>Host</label>
              <input type="text" value={host} onChange={(e) => setHost(e.target.value)}
                placeholder="api.example.com" className={`${ic} font-mono`} />
            </div>
            <div>
              <label className={lc}>Path</label>
              <input type="text" value={path} onChange={(e) => setPath(e.target.value)}
                placeholder="/" className={`${ic} font-mono`} />
            </div>
            <div>
              <label className={lc}>Protocol</label>
              <select value={protocol} onChange={(e) => setProtocol(e.target.value as PacketProtocol)} className={ic}>
                <option value="https">https</option>
                <option value="http">http</option>
                <option value="grpc">grpc</option>
                <option value="tcp">tcp</option>
              </select>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 h-[38px]"
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />추적 중</>
                : <><Search className="w-4 h-4" />추적 시작</>}
            </button>
          </div>
        </div>

        {/* 결과 */}
        {errorMsg && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 mb-6 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">추적 실패</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* 요약 배너 */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">요청:</span>
                <span className="font-mono text-foreground">{result.protocol}://{result.host}{result.path}</span>
              </div>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">홉:</span>
                <span className="font-semibold text-foreground">{result.hops.length}</span>
              </div>
              {totalLatency !== undefined && totalLatency > 0 && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">누적 지연:</span>
                    <span className="font-semibold text-foreground">{totalLatency.toFixed(1)}ms</span>
                  </div>
                </>
              )}
              {errorHops > 0 && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <div className="flex items-center gap-2 text-sm text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    이상 홉 {errorHops}건
                  </div>
                </>
              )}
            </div>

            {/* 홉 플로우 시각화 */}
            <div className="overflow-x-auto pb-4">
              <div className="flex items-stretch gap-2 min-w-max px-2">
                {result.hops.map((hop, i) => (
                  <div key={`${hop.entityType}-${hop.entityId}-${i}`} className="flex items-center gap-2">
                    <HopCard hop={hop} index={i} />
                    {i < result.hops.length - 1 && (
                      <ArrowRight className="w-5 h-5 text-muted-foreground/60 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 상세 테이블 */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr className="border-b border-border">
                    {['#', '타입', '이름', '인터페이스/주소', '지연(ms)', '에러'].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.hops.map((hop, i) => {
                    const style = HOP_STYLE[hop.entityType] ?? HOP_STYLE.link;
                    return (
                      <tr key={`${hop.entityId}-${i}`} className="border-b border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[11px] font-semibold ${style.color}`}>{style.label}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">{hop.name}</td>
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{hop.interface ?? '-'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {hop.latencyMs !== null && hop.latencyMs !== undefined ? hop.latencyMs.toFixed(1) : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {(hop.errorCount ?? 0) > 0
                            ? <span className="text-amber-400 font-semibold">{hop.errorCount}</span>
                            : <span className="text-muted-foreground">-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!result && !errorMsg && !isPending && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50 rounded-xl border border-dashed border-border">
            <Route className="w-12 h-12 mb-3" />
            <p className="text-sm">클러스터와 host를 입력하고 추적을 시작하세요</p>
            <p className="text-xs mt-1">예: api.example.com, /api/v1/users, https</p>
          </div>
        )}
      </main>
    </div>
  );
}
