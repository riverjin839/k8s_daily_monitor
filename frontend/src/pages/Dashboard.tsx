import { useState } from 'react';
import { Download, BookOpen } from 'lucide-react';
import { Header } from '@/components/layout';
import {
  SummaryStats,
  ClusterTabs,
  AddonGrid,
  HistoryLog,
  AddClusterModal,
} from '@/components/dashboard';
import { PlaybookCard } from '@/components/playbooks';
import { useClusterStore } from '@/stores/clusterStore';
import { usePlaybookStore } from '@/stores/playbookStore';
import { useClusters, useSummary, useAddons, useLogs, useHealthCheck, useCreateAddon } from '@/hooks/useCluster';
import { useDashboardPlaybooks, useRunPlaybook, useDeletePlaybook, useToggleDashboard } from '@/hooks/usePlaybook';
import { healthApi } from '@/services/api';

export function Dashboard() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [showAddCluster, setShowAddCluster] = useState(false);
  const { clusters, summary, addons, logs } = useClusterStore();

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

  // Dashboard playbooks
  const { data: dashboardPlaybooks = [] } = useDashboardPlaybooks(activeClusterId);
  const { runningIds } = usePlaybookStore();
  const runPlaybook = useRunPlaybook();
  const deletePlaybook = useDeletePlaybook();
  const toggleDashboard = useToggleDashboard();

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

  const handleSettings = () => {
    // TODO: Settings modal/page
    console.log('Open settings');
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
      <Header onRunCheck={handleRunCheck} onSettings={handleSettings} />

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

          <AddonGrid
            addons={currentAddons}
            isLoading={clustersLoading || addonsLoading}
            onAddDefaultAddons={clusters.length > 0 && missingAddons.length > 0 ? handleAddDefaultAddons : undefined}
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
                />
              ))}
            </div>
          </section>
        )}

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
    </div>
  );
}
