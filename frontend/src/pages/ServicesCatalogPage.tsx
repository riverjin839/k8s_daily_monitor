import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { ClusterSidebar, DebugLogPanel } from '@/components/common';
import { serviceEntriesApi } from '@/services/api';
import { SERVICE_CATALOG, getServiceDef, colorBadgeClass } from '@/components/services/serviceCatalog';

function relTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return '-';
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString();
}

export function ServicesCatalogPage() {
  const { data: clusters = [] } = useClusters();
  const [clusterId, setClusterId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const catalogQ = useQuery({
    queryKey: ['service-catalog', clusterId],
    queryFn: () => serviceEntriesApi.catalog(clusterId || undefined).then((r) => r.data.services),
    staleTime: 30_000,
  });

  // 카탈로그(고정) + DB 의 stats 병합. DB 에만 있는 키는 'other' 로 fallback.
  const merged = useMemo(() => {
    const stats = new Map((catalogQ.data ?? []).map((s) => [s.service, s]));
    const known = SERVICE_CATALOG.map((def) => {
      const s = stats.get(def.key);
      return { def, total: s?.total ?? 0, byKind: s?.byKind ?? {}, lastUpdated: s?.lastUpdated ?? null };
    });
    // DB 에만 있는 (custom) 서비스
    const customs = (catalogQ.data ?? [])
      .filter((s) => !SERVICE_CATALOG.find((d) => d.key === s.service))
      .map((s) => ({ def: getServiceDef(s.service), total: s.total, byKind: s.byKind, lastUpdated: s.lastUpdated }));
    const all = [...known, ...customs];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(({ def }) => def.label.toLowerCase().includes(q) || def.key.toLowerCase().includes(q));
  }, [catalogQ.data, search]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-4 py-3 flex gap-3">
        <ClusterSidebar
          clusters={clusters}
          selectedId={clusterId}
          onSelect={setClusterId}
          allowAll
          allLabel="전체 (전역 + 클러스터별)"
        />

        <div className="flex-1 min-w-0">
          <DebugLogPanel pageKey="services" extra={{ clusterId, search, services: merged.length }} />

          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">서비스 지식관리</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
              {merged.length} 서비스
            </span>
            <div className="ml-auto relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="서비스 검색..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            주요 관리 서비스별로 운영 가이드 · 트러블슈팅 · 변경 이력 · 메모 · 리소스 링크를 한 곳에서 관리합니다.
            전역 항목 + {clusterId ? '선택한 클러스터' : '모든 클러스터'} 항목 통합 표시.
          </p>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {merged.map(({ def, total, byKind, lastUpdated }) => {
              const Icon = def.icon;
              const cls = colorBadgeClass(def.color);
              return (
                <Link
                  key={def.key}
                  to={`/services/${def.key}${clusterId ? `?cluster=${clusterId}` : ''}`}
                  className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{def.label}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">
                          {def.key}
                        </span>
                      </div>
                      {def.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{def.description}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">
                      {total === 0 ? <span className="text-muted-foreground/60 font-normal">항목 없음</span> : `${total} 건`}
                    </span>
                    {lastUpdated && (
                      <span className="text-muted-foreground">{relTime(lastUpdated)}</span>
                    )}
                  </div>

                  {Object.keys(byKind).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(byKind).map(([k, n]) => (
                        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">
                          {k} {n}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
