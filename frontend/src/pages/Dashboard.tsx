import { useState } from 'react';
import { Header } from '@/components/layout';
import {
  SummaryStats,
  ClusterTabs,
  AddonGrid,
  HistoryLog,
  AddClusterModal,
} from '@/components/dashboard';
import { useClusterStore } from '@/stores/clusterStore';
import { useClusters, useSummary, useAddons, useLogs, useHealthCheck } from '@/hooks/useCluster';

export function Dashboard() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [showAddCluster, setShowAddCluster] = useState(false);
  const { clusters, summary, addons, logs } = useClusterStore();

  // Queries
  const { isLoading: clustersLoading } = useClusters();
  const { isLoading: summaryLoading } = useSummary();
  const { isLoading: logsLoading } = useLogs();
  
  // 선택된 클러스터의 애드온 로드
  const { isLoading: addonsLoading } = useAddons(selectedClusterId || clusters[0]?.id || '');

  // Health Check mutation
  const healthCheck = useHealthCheck();

  const handleRunCheck = () => {
    if (selectedClusterId) {
      healthCheck.mutate(selectedClusterId);
    } else {
      // 모든 클러스터 점검
      clusters.forEach((cluster) => {
        healthCheck.mutate(cluster.id);
      });
    }
  };

  const handleSettings = () => {
    // TODO: Settings modal/page
    console.log('Open settings');
  };

  // 현재 표시할 애드온
  const currentAddons = selectedClusterId
    ? addons[selectedClusterId] || []
    : Object.values(addons).flat();

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
    </div>
  );
}
