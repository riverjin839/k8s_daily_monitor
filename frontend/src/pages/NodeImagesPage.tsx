import { useMemo, useState } from 'react';
import { Boxes, Search, AlertTriangle } from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { useNodeImageList } from '@/hooks/useNodeImages';
import { NodeImagesTable } from '@/components/node-images';
import { ClusterSidebar } from '@/components/common';
import { formatApiError } from '@/lib/utils';

function extractErrorMessage(error: unknown): string {
  return formatApiError(error, '알 수 없는 오류가 발생했습니다.');
}

export function NodeImagesPage() {
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();

  const [selectedClusterId, setSelectedClusterId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const activeClusterId = selectedClusterId || clusters[0]?.id || '';
  const {
    data: nodes = [],
    isLoading: nodesLoading,
    isError: nodesError,
    error: nodesErrorDetail,
  } = useNodeImageList(activeClusterId);

  const activeClusterName = useMemo(
    () => clusters.find((c) => c.id === activeClusterId)?.name || '-',
    [clusters, activeClusterId],
  );

  const totals = useMemo(() => {
    const totalImages = nodes.reduce((acc, n) => acc + n.image_count, 0);
    const totalSize = nodes.reduce((acc, n) => acc + n.total_size_bytes, 0);
    return { totalImages, totalSize };
  }, [nodes]);

  const isLoading = clustersLoading || nodesLoading;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto px-6 py-6 flex gap-5">
        <ClusterSidebar
          clusters={clusters}
          selectedId={activeClusterId || null}
          onSelect={(id) => setSelectedClusterId(id ?? '')}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-semibold">Node Images</h1>
              {activeClusterName !== '-' && (
                <span className="text-sm text-muted-foreground">
                  — <span className="font-medium text-foreground">{activeClusterName}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="노드명 또는 이미지명 검색..."
                className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {!isLoading && nodes.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {nodes.length}개 노드 · 총 {totals.totalImages}개 이미지
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              {clustersLoading ? 'Loading clusters...' : 'Loading node images...'}
            </div>
          ) : !activeClusterId ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              클러스터를 선택하세요.
            </div>
          ) : nodesError ? (
            <div className="bg-card border border-red-500/30 rounded-xl p-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <div>
                  <p className="font-medium text-red-400 mb-1">노드 이미지 정보를 불러올 수 없습니다</p>
                  <p className="text-sm text-muted-foreground max-w-lg">
                    {extractErrorMessage(nodesErrorDetail)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  클러스터의 kubeconfig 경로와 API Endpoint 설정을 확인하세요.
                </p>
              </div>
            </div>
          ) : (
            <NodeImagesTable nodes={nodes} searchQuery={searchQuery} />
          )}
        </div>
      </main>
    </div>
  );
}
