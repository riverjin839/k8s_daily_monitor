import { useState } from 'react';
import { Plus, Play, BookOpen, Download } from 'lucide-react';
import { PlaybookCard, AddPlaybookModal } from '@/components/playbooks';
import { usePlaybooks, useCreatePlaybook, useDeletePlaybook, useRunPlaybook, useToggleDashboard } from '@/hooks/usePlaybook';
import { playbooksApi } from '@/services/api';
import { usePlaybookStore } from '@/stores/playbookStore';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';

export function PlaybooksPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string>('');

  const { clusters } = useClusterStore();
  useClusters(); // fetch

  const activeClusterId = selectedClusterId || clusters[0]?.id || '';
  const { isLoading } = usePlaybooks(activeClusterId || undefined);
  const { playbooks, runningIds } = usePlaybookStore();

  const createPlaybook = useCreatePlaybook();
  const deletePlaybook = useDeletePlaybook();
  const runPlaybook = useRunPlaybook();
  const toggleDashboard = useToggleDashboard();

  // 현재 클러스터의 playbooks만 필터
  const filteredPlaybooks = activeClusterId
    ? playbooks.filter((p) => p.clusterId === activeClusterId)
    : playbooks;

  const handleCreate = (data: {
    name: string;
    description: string;
    playbookPath: string;
    inventoryPath: string;
    tags: string;
    clusterId: string;
  }) => {
    createPlaybook.mutate({
      name: data.name,
      description: data.description || undefined,
      playbookPath: data.playbookPath,
      inventoryPath: data.inventoryPath || undefined,
      tags: data.tags || undefined,
      clusterId: data.clusterId,
    });
  };

  const handleRunAll = () => {
    filteredPlaybooks.forEach((p) => {
      if (!runningIds.has(p.id)) {
        runPlaybook.mutate(p.id);
      }
    });
  };

  const handleExportReport = async () => {
    try {
      const { data } = await playbooksApi.exportReport(activeClusterId || undefined);
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `k8s-daily-report-${today}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  // 상태별 카운트
  const statusCounts = {
    total: filteredPlaybooks.length,
    healthy: filteredPlaybooks.filter((p) => p.status === 'healthy').length,
    warning: filteredPlaybooks.filter((p) => p.status === 'warning').length,
    critical: filteredPlaybooks.filter((p) => p.status === 'critical').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Ansible Playbooks</h1>
          {statusCounts.total > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {statusCounts.healthy} OK
              </span>
              {statusCounts.warning > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  {statusCounts.warning} Changed
                </span>
              )}
              {statusCounts.critical > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                  {statusCounts.critical} Failed
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Cluster Selector */}
          {clusters.length > 1 && (
            <select
              value={selectedClusterId}
              onChange={(e) => setSelectedClusterId(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">All Clusters</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {filteredPlaybooks.length > 0 && (
            <>
              <button
                onClick={handleExportReport}
                className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export .md
              </button>
              <button
                onClick={handleRunAll}
                className="px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Run All
              </button>
            </>
          )}

          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Register Playbook
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-48 animate-pulse" />
          ))}
        </div>
      ) : filteredPlaybooks.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground mb-4">No playbooks registered yet</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
          >
            + Register your first playbook
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPlaybooks.map((playbook) => (
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
      )}

      {/* Modal */}
      <AddPlaybookModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleCreate}
        clusters={clusters}
        defaultClusterId={activeClusterId}
      />
      </main>
    </div>
  );
}
