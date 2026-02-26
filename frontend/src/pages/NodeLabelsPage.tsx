import { useMemo, useState } from 'react';
import { Tags } from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { useNodeList, usePatchNodeLabels, NodeInfo } from '@/hooks/useNodeLabels';
import { NodeLabelEditorModal, NodeLabelsTable } from '@/components/node-labels';

export function NodeLabelsPage() {
  const { clusters } = useClusterStore();
  useClusters();

  const [selectedClusterId, setSelectedClusterId] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const activeClusterId = selectedClusterId || clusters[0]?.id || '';
  const { data: nodes = [], isLoading } = useNodeList(activeClusterId);
  const patchNodeLabels = usePatchNodeLabels(activeClusterId);

  const activeClusterName = useMemo(
    () => clusters.find((c) => c.id === activeClusterId)?.name || '-',
    [clusters, activeClusterId],
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1500px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold">Node Labels</h1>
          </div>
          <select
            value={activeClusterId}
            onChange={(e) => setSelectedClusterId(e.target.value)}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm"
          >
            {clusters.map((cluster) => (
              <option key={cluster.id} value={cluster.id}>{cluster.name}</option>
            ))}
          </select>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          Cluster: <span className="font-medium text-foreground">{activeClusterName}</span>
        </div>

        {isLoading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">Loading nodes...</div>
        ) : (
          <NodeLabelsTable nodes={nodes} onEdit={setSelectedNode} />
        )}
      </main>

      <NodeLabelEditorModal
        node={selectedNode}
        isOpen={!!selectedNode}
        onClose={() => setSelectedNode(null)}
        onApply={(payload) => {
          if (!selectedNode) return;
          patchNodeLabels.mutate({ nodeName: selectedNode.name, payload });
        }}
      />
    </div>
  );
}
