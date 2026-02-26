import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Server, Pencil, Trash2, Plus, Globe, ShieldCheck, Clock } from 'lucide-react';
import { useClusters, useCreateCluster, useUpdateCluster, useDeleteCluster } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { Cluster } from '@/types';
import { getStatusIcon, formatDateTime } from '@/lib/utils';

function ClusterFormModal({
  isOpen,
  onClose,
  onSubmit,
  editCluster,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; apiEndpoint: string; kubeconfigPath?: string }) => void;
  editCluster?: Cluster | null;
}) {
  const [name, setName] = useState(editCluster?.name ?? '');
  const [apiEndpoint, setApiEndpoint] = useState(editCluster?.apiEndpoint ?? '');
  const [kubeconfigPath, setKubeconfigPath] = useState(editCluster?.kubeconfigPath ?? '');

  // Re-populate fields whenever the target cluster changes
  useEffect(() => {
    setName(editCluster?.name ?? '');
    setApiEndpoint(editCluster?.apiEndpoint ?? '');
    setKubeconfigPath(editCluster?.kubeconfigPath ?? '');
  }, [editCluster]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !apiEndpoint.trim()) return;
    onSubmit({
      name: name.trim(),
      apiEndpoint: apiEndpoint.trim(),
      kubeconfigPath: kubeconfigPath.trim() || undefined,
    });
    onClose();
  };

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-lg font-semibold mb-4">
          {editCluster ? '클러스터 수정' : '클러스터 등록'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">클러스터 이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: prod-cluster-01"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">API Endpoint *</label>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://10.0.0.1:6443"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Kubeconfig Path</label>
            <input
              type="text"
              value={kubeconfigPath}
              onChange={(e) => setKubeconfigPath(e.target.value)}
              placeholder="/path/to/kubeconfig (선택)"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              {editCluster ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);

  const { clusters } = useClusterStore();
  useClusters();

  const createCluster = useCreateCluster();
  const updateCluster = useUpdateCluster();
  const deleteCluster = useDeleteCluster();

  const handleCreate = (data: { name: string; apiEndpoint: string; kubeconfigPath?: string }) => {
    createCluster.mutate(data);
  };

  const handleUpdate = (data: { name: string; apiEndpoint: string; kubeconfigPath?: string }) => {
    if (!editCluster) return;
    updateCluster.mutate({ id: editCluster.id, data });
    setEditCluster(null);
  };

  const handleDelete = (cluster: Cluster) => {
    if (!confirm(`클러스터 "${cluster.name}"을(를) 삭제하시겠습니까? 관련 Addon, CheckLog, Playbook이 모두 삭제됩니다.`)) return;
    deleteCluster.mutate(cluster.id);
  };

  const handleEdit = (cluster: Cluster) => {
    setEditCluster(cluster);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditCluster(null);
  };

  const statusCounts = {
    healthy: clusters.filter((c) => c.status === 'healthy').length,
    warning: clusters.filter((c) => c.status === 'warning').length,
    critical: clusters.filter((c) => c.status === 'critical').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Settings</h1>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Server className="w-4 h-4" />
              전체 클러스터
            </div>
            <p className="text-2xl font-bold">{clusters.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-1">
              <ShieldCheck className="w-4 h-4" />
              Healthy
            </div>
            <p className="text-2xl font-bold text-emerald-400">{statusCounts.healthy}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Warning
            </div>
            <p className="text-2xl font-bold text-amber-400">{statusCounts.warning}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
              <Globe className="w-4 h-4" />
              Critical
            </div>
            <p className="text-2xl font-bold text-red-400">{statusCounts.critical}</p>
          </div>
        </div>

        {/* Cluster List */}
        <div className="bg-card border border-border rounded-xl">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">등록된 클러스터</h2>
            <button
              onClick={() => { setEditCluster(null); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              클러스터 추가
            </button>
          </div>

          {clusters.length === 0 ? (
            <div className="text-center py-16">
              <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-4">등록된 클러스터가 없습니다.</p>
              <button
                onClick={() => { setEditCluster(null); setShowModal(true); }}
                className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + 첫 번째 클러스터 등록
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {clusters.map((cluster) => (
                <div
                  key={cluster.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors"
                >
                  <span className="text-xl">{getStatusIcon(cluster.status)}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{cluster.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${
                        cluster.status === 'healthy'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : cluster.status === 'warning'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-red-500/10 text-red-400 border-red-500/30'
                      }`}>
                        {cluster.status}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4">
                      <span className="font-mono">{cluster.apiEndpoint}</span>
                      {cluster.kubeconfigPath && (
                        <span className="text-xs">kubeconfig: {cluster.kubeconfigPath}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      등록일: {formatDateTime(cluster.createdAt)}
                      {cluster.updatedAt !== cluster.createdAt && (
                        <span className="ml-4">수정일: {formatDateTime(cluster.updatedAt)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(cluster)}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="수정"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cluster)}
                      className="p-2 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ClusterFormModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSubmit={editCluster ? handleUpdate : handleCreate}
        editCluster={editCluster}
      />
    </div>
  );
}
