import { useState } from 'react';
import { Download, BookOpen, Plus, Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, Server } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import {
  SummaryStats,
  ClusterTabs,
  AddonGrid,
  HistoryLog,
  AddClusterModal,
  AddAddonModal,
  MetricCardGrid,
  AddMetricCardModal,
  KubeconfigEditModal,
  KanbanSummaryCharts,
} from '@/components/dashboard';
import { PlaybookCard, AddPlaybookModal } from '@/components/playbooks';
import { useClusterStore } from '@/stores/clusterStore';
import { usePlaybookStore } from '@/stores/playbookStore';
import { useClusters, useSummary, useAddons, useLogs, useHealthCheck, useCreateAddon, useDeleteAddon, useAddonHealthCheck } from '@/hooks/useCluster';
import { useDashboardPlaybooks, useRunPlaybook, useDeletePlaybook, useToggleDashboard, useUpdatePlaybook } from '@/hooks/usePlaybook';
import { useMetricCards, useMetricResults, useDeleteMetricCard } from '@/hooks/useMetricCards';
import { useTasks } from '@/hooks/useTasks';
import { useIssues } from '@/hooks/useIssues';
import { healthApi } from '@/services/api';
import { Addon, Cluster, MetricCard, Playbook } from '@/types';

// ── Cluster Overview Grid (shown when All tab is selected) ─────────────────────
interface ClusterOverviewGridProps {
  clusters: Cluster[];
  addons: Record<string, Addon[]>;
  onSelectCluster: (id: string) => void;
}

function ClusterOverviewGrid({ clusters, addons, onSelectCluster }: ClusterOverviewGridProps) {
  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        등록된 클러스터가 없습니다. 클러스터를 추가하세요.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {clusters.map((cluster) => {
        const clusterAddons = addons[cluster.id] ?? [];
        const healthy  = clusterAddons.filter((a) => a.status === 'healthy').length;
        const warning  = clusterAddons.filter((a) => a.status === 'warning').length;
        const critical = clusterAddons.filter((a) => a.status === 'critical').length;
        const total    = clusterAddons.length;

        const statusColor = {
          healthy:  { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
          warning:  { border: 'border-yellow-500/40',  bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  dot: 'bg-yellow-400'  },
          critical: { border: 'border-red-500/40',     bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400'     },
          pending:  { border: 'border-slate-500/40',   bg: 'bg-slate-500/10',   text: 'text-slate-400',   dot: 'bg-slate-400'   },
        }[cluster.status] ?? { border: 'border-border', bg: 'bg-muted/20', text: 'text-muted-foreground', dot: 'bg-slate-400' };

        return (
          <button
            key={cluster.id}
            onClick={() => onSelectCluster(cluster.id)}
            className={`bg-card border rounded-xl p-5 text-left hover:shadow-md transition-all group ${statusColor.border} hover:border-primary/40`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${statusColor.bg}`}>
                  <Server className={`w-4 h-4 ${statusColor.text}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                    {cluster.name}
                  </p>
                  {cluster.region && (
                    <p className="text-xs text-muted-foreground truncate">{cluster.region}</p>
                  )}
                </div>
              </div>
              <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1 ${statusColor.dot}`} />
            </div>

            {/* Status label */}
            <div className={`text-xs font-medium px-2 py-1 rounded-full inline-flex items-center gap-1.5 mb-4 ${statusColor.bg} ${statusColor.text}`}>
              {cluster.status === 'healthy'  && <CheckCircle className="w-3 h-3" />}
              {cluster.status === 'warning'  && <AlertTriangle className="w-3 h-3" />}
              {cluster.status === 'critical' && <XCircle className="w-3 h-3" />}
              {cluster.status === 'healthy' ? '정상' : cluster.status === 'warning' ? '경고' : '위험'}
            </div>

            {/* Check counts */}
            {total > 0 ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">전체 점검</span>
                  <span className="font-medium">{total}</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    <span>{healthy}</span>
                  </div>
                  {warning > 0 && (
                    <div className="flex items-center gap-1 text-xs text-yellow-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{warning}</span>
                    </div>
                  )}
                  {critical > 0 && (
                    <div className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle className="w-3 h-3" />
                      <span>{critical}</span>
                    </div>
                  )}
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden flex gap-px">
                  {healthy  > 0 && <div className="bg-emerald-500 rounded-full" style={{ width: `${(healthy / total) * 100}%` }} />}
                  {warning  > 0 && <div className="bg-yellow-500 rounded-full"  style={{ width: `${(warning / total) * 100}%` }} />}
                  {critical > 0 && <div className="bg-red-500 rounded-full"     style={{ width: `${(critical / total) * 100}%` }} />}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">점검 항목 없음</p>
            )}

            {cluster.nodeCount != null && (
              <p className="text-xs text-muted-foreground mt-3">노드 {cluster.nodeCount}개</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [showAddCluster, setShowAddCluster] = useState(false);
  const [showAddAddon, setShowAddAddon] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [showPlaybookModal, setShowPlaybookModal] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [showKubeconfig, setShowKubeconfig] = useState(false);
  const [editingMetricCard, setEditingMetricCard] = useState<MetricCard | null>(null);
  const { clusters, summary, addons, logs, isChecking, lastCheckTime } = useClusterStore();

  // Queries
  const { isLoading: clustersLoading } = useClusters();
  const { isLoading: summaryLoading } = useSummary();
  const { isLoading: logsLoading } = useLogs();

  // 선택된 클러스터의 애드온 로드
  const activeClusterId = selectedClusterId || clusters[0]?.id || '';
  const { isLoading: addonsLoading } = useAddons(activeClusterId);

  // Health Check mutation
  const healthCheck = useHealthCheck();
  const createAddon = useCreateAddon();
  const deleteAddon = useDeleteAddon();
  const addonHealthCheck = useAddonHealthCheck();

  // Dashboard playbooks
  const { data: dashboardPlaybooks = [] } = useDashboardPlaybooks(activeClusterId);
  const { runningIds } = usePlaybookStore();
  const runPlaybook = useRunPlaybook();
  const deletePlaybook = useDeletePlaybook();
  const updatePlaybook = useUpdatePlaybook();
  const toggleDashboard = useToggleDashboard();

  // PromQL Metric Cards
  const { data: metricCards = [], isLoading: metricsLoading } = useMetricCards();
  const { data: metricResults = [] } = useMetricResults();
  const deleteMetricCard = useDeleteMetricCard();

  // Kanban summary data
  const { data: tasksData, isLoading: tasksLoading } = useTasks();
  const { data: issuesData, isLoading: issuesLoading } = useIssues();
  const allTasks = tasksData?.data ?? [];
  const allIssues = issuesData?.data ?? [];

  const handleRunCheck = async () => {
    if (selectedClusterId) {
      healthCheck.mutate(selectedClusterId);
    } else if (clusters.length > 0) {
      // 순차 실행: 각 클러스터 점검 완료 후 다음 진행
      for (const cluster of clusters) {
        try {
          await healthCheck.mutateAsync(cluster.id);
        } catch (e) {
          console.error(`Check failed for ${cluster.name}:`, e);
        }
      }
    }
  };

  const DEFAULT_ADDONS = [
    { name: 'etcd Leader', type: 'etcd-leader', icon: '💾', description: 'etcd leader election & health status' },
    { name: 'Node Status', type: 'node-check', icon: '🖥️', description: 'Node readiness & pressure conditions' },
    { name: 'Control Plane', type: 'control-plane', icon: '🎛️', description: 'API Server, Scheduler, Controller Manager' },
    { name: 'CoreDNS', type: 'system-pod', icon: '🔍', description: 'Cluster DNS service' },
  ];

  // 현재 표시할 애드온
  const currentAddons = selectedClusterId
    ? addons[selectedClusterId] || []
    : Object.values(addons).flat();

  // 이미 등록된 타입을 제외한 missing addons 계산
  const existingTypes = new Set(currentAddons.map((a) => a.type));
  const missingAddons = DEFAULT_ADDONS.filter((a) => !existingTypes.has(a.type));

  const handleAddDefaultAddons = () => {
    const clusterId = activeClusterId;
    if (!clusterId) return;
    missingAddons.forEach((addon) => {
      createAddon.mutate({ clusterId, ...addon });
    });
  };

  const handleDailyReport = async (fmt: 'md' | 'csv') => {
    try {
      const { data } = await healthApi.exportReport(activeClusterId || undefined, fmt);
      const blob = data instanceof Blob ? data : new Blob([data], { type: fmt === 'csv' ? 'text/csv' : 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `k8s-daily-report-${today}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Page top bar */}
      <div className="px-8 py-4 border-b border-border flex items-center justify-between">
        <h1 className="font-semibold text-base">Dashboard</h1>
        <div className="flex items-center gap-4">
          {lastCheckTime && (
            <span className="text-xs text-muted-foreground font-mono">
              Last check: {formatDateTime(lastCheckTime)}
            </span>
          )}
          <button
            onClick={handleRunCheck}
            disabled={isChecking}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Run Check'}
          </button>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Summary Stats */}
        <SummaryStats
          stats={summary ?? { totalClusters: 0, healthy: 0, warning: 0, critical: 0 }}
          isLoading={summaryLoading}
        />

        {/* Cluster Status Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Cluster Status
              </h2>
              <button
                onClick={() => setShowAddCluster(true)}
                className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + Add Cluster
              </button>
              {clusters.length > 0 && (
                <button
                  onClick={() => setShowAddAddon(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Check
                </button>
              )}
              {selectedClusterId && (
                <button
                  onClick={() => setShowKubeconfig(true)}
                  className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
                >
                  Kubeconfig
                </button>
              )}
              <button
                onClick={() => handleDailyReport('md')}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3 h-3" />
                Daily Report .md
              </button>
              <button
                onClick={() => handleDailyReport('csv')}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3 h-3" />
                .csv
              </button>
            </div>
            <ClusterTabs
              clusters={clusters}
              selectedId={selectedClusterId}
              onSelect={setSelectedClusterId}
            />
          </div>

          {selectedClusterId === null ? (
            <ClusterOverviewGrid
              clusters={clusters}
              addons={addons}
              onSelectCluster={setSelectedClusterId}
            />
          ) : (
            <AddonGrid
              addons={currentAddons}
              isLoading={clustersLoading || addonsLoading}
              onAddDefaultAddons={clusters.length > 0 && missingAddons.length > 0 ? handleAddDefaultAddons : undefined}
              onEditAddon={(addon) => {
                setEditingAddon(addon);
                setShowAddAddon(true);
              }}
              onDeleteAddon={(addon) => {
                if (confirm(`Delete check "${addon.name}"?`)) {
                  deleteAddon.mutate({ addonId: addon.id, clusterId: addon.clusterId });
                }
              }}
              onRunAddon={(addon) => {
                addonHealthCheck.mutate({ clusterId: addon.clusterId, addonId: addon.id });
              }}
            />
          )}
        </section>

        {/* Prometheus Insights (PromQL Metric Cards) */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Prometheus Insights</h2>
              <span className="text-xs text-muted-foreground">({metricCards.length})</span>
            </div>
            <button
              onClick={() => {
                setEditingMetricCard(null);
                setShowAddMetric(true);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Metric
            </button>
          </div>
          <MetricCardGrid
            cards={metricCards}
            results={metricResults}
            isLoading={metricsLoading}
            onDeleteCard={(id) => {
              if (confirm('Delete this metric card?')) {
                deleteMetricCard.mutate(id);
              }
            }}
            onEditCard={(card) => {
              setEditingMetricCard(card);
              setShowAddMetric(true);
            }}
          />
        </section>

        {/* Dashboard Playbooks */}
        {dashboardPlaybooks.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Playbook Checks</h2>
              <span className="text-xs text-muted-foreground">({dashboardPlaybooks.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {dashboardPlaybooks.map((playbook) => (
                <PlaybookCard
                  key={playbook.id}
                  playbook={playbook}
                  isRunning={runningIds.has(playbook.id)}
                  onRun={() => runPlaybook.mutate(playbook.id)}
                  onDelete={() => {
                    if (confirm(`Delete playbook "${playbook.name}"?`)) {
                      deletePlaybook.mutate(playbook.id);
                    }
                  }}
                  onToggleDashboard={() => toggleDashboard.mutate(playbook.id)}
                  onEdit={() => {
                    setEditingPlaybook(playbook);
                    setShowPlaybookModal(true);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Kanban Summary Charts */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold">작업 / 이슈 현황</h2>
          </div>
          <KanbanSummaryCharts
            tasks={allTasks}
            issues={allIssues}
            isLoading={tasksLoading || issuesLoading}
            selectedClusterId={selectedClusterId}
          />
        </section>

        {/* History Log */}
        <HistoryLog
          logs={logs}
          isLoading={logsLoading}
          maxItems={10}
          onViewAll={() => console.log('View all logs')}
        />
      </main>

      {/* Add Cluster Modal */}
      <AddClusterModal
        isOpen={showAddCluster}
        onClose={() => setShowAddCluster(false)}
      />

      {/* Add Addon Modal */}
      <AddAddonModal
        isOpen={showAddAddon}
        onClose={() => {
          setShowAddAddon(false);
          setEditingAddon(null);
        }}
        clusterId={activeClusterId}
        editingAddon={editingAddon}
      />


      {/* Add Metric Card Modal */}
      <AddMetricCardModal
        isOpen={showAddMetric}
        onClose={() => {
          setShowAddMetric(false);
          setEditingMetricCard(null);
        }}
        editingCard={editingMetricCard}
      />

      {/* Kubeconfig Edit Modal */}
      {selectedClusterId && (
        <KubeconfigEditModal
          clusterId={selectedClusterId}
          clusterName={clusters.find((c) => c.id === selectedClusterId)?.name ?? ''}
          isOpen={showKubeconfig}
          onClose={() => setShowKubeconfig(false)}
        />
      )}

      {/* Playbook Edit Modal */}
      <AddPlaybookModal
        isOpen={showPlaybookModal}
        onClose={() => {
          setShowPlaybookModal(false);
          setEditingPlaybook(null);
        }}
        onSubmit={(data) => {
          if (!editingPlaybook) return;
          updatePlaybook.mutate({
            id: editingPlaybook.id,
            data: {
              name: data.name,
              description: data.description || undefined,
              playbookPath: data.playbookPath,
              inventoryPath: data.inventoryPath || undefined,
              tags: data.tags || undefined,
              clusterId: data.clusterId,
            },
          });
          setShowPlaybookModal(false);
          setEditingPlaybook(null);
        }}
        clusters={clusters}
        defaultClusterId={activeClusterId}
        initialData={editingPlaybook}
      />
    </div>
  );
}
