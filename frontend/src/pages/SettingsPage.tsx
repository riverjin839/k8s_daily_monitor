import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Server, Pencil, Trash2, Plus, Globe, ShieldCheck, Clock, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { useClusters, useUpdateCluster, useDeleteCluster } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { AddClusterModal, KubeconfigEditModal } from '@/components/dashboard';
import { Cluster } from '@/types';
import { getStatusIcon, formatDateTime } from '@/lib/utils';

// ── Edit Cluster Modal ──────────────────────────────────────────────────────

function EditClusterModal({
  isOpen,
  onClose,
  cluster,
}: {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster | null;
}) {
  const [name, setName] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [kubeconfigPath, setKubeconfigPath] = useState('');
  const [error, setError] = useState('');

  const updateCluster = useUpdateCluster();

  useEffect(() => {
    if (cluster) {
      setName(cluster.name);
      setApiEndpoint(cluster.apiEndpoint);
      setKubeconfigPath(cluster.kubeconfigPath ?? '');
    }
    setError('');
  }, [cluster, isOpen]);

  if (!isOpen || !cluster) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !apiEndpoint.trim()) {
      setError('클러스터 이름과 API Endpoint는 필수입니다.');
      return;
    }
    setError('');
    try {
      await updateCluster.mutateAsync({
        id: cluster.id,
        data: {
          name: name.trim(),
          apiEndpoint: apiEndpoint.trim(),
          kubeconfigPath: kubeconfigPath.trim() || undefined,
        },
      });
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(axiosErr.response?.data?.detail ?? axiosErr.message ?? '수정에 실패했습니다.');
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold mb-5">클러스터 수정</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">클러스터 이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={updateCluster.isPending}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">API Endpoint *</label>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              disabled={updateCluster.isPending}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Kubeconfig 파일 경로
              <span className="ml-1 text-xs text-muted-foreground/60">(내용 변경은 Kubeconfig 버튼 이용)</span>
            </label>
            <input
              type="text"
              value={kubeconfigPath}
              onChange={(e) => setKubeconfigPath(e.target.value)}
              disabled={updateCluster.isPending}
              placeholder="/root/.kube/config"
              className={inputClass}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={updateCluster.isPending}
              className="px-4 py-2.5 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={updateCluster.isPending}
              className="px-5 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {updateCluster.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [kubeconfigCluster, setKubeconfigCluster] = useState<Cluster | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { clusters } = useClusterStore();
  useClusters();

  const deleteCluster = useDeleteCluster();

  const handleDelete = async (cluster: Cluster) => {
    if (
      !confirm(
        `클러스터 "${cluster.name}"을(를) 삭제하시겠습니까?\n관련 Addon, CheckLog, Playbook이 모두 삭제됩니다.`
      )
    )
      return;

    setDeletingId(cluster.id);
    try {
      await deleteCluster.mutateAsync(cluster.id);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = axiosErr.response?.data?.detail ?? axiosErr.message ?? '삭제에 실패했습니다.';
      alert(`삭제 실패: ${msg}`);
    } finally {
      setDeletingId(null);
    }
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
              onClick={() => setShowAddModal(true)}
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
                onClick={() => setShowAddModal(true)}
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
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          cluster.status === 'healthy'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : cluster.status === 'warning'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}
                      >
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
                      onClick={() => setKubeconfigCluster(cluster)}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="Kubeconfig 확인/수정"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditCluster(cluster)}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="수정"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cluster)}
                      disabled={deletingId === cluster.id}
                      className="p-2 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
                      title="삭제"
                    >
                      {deletingId === cluster.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Cluster Modal — same as dashboard (with connectivity check + kubeconfig tabs) */}
      <AddClusterModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {/* Edit Cluster Modal */}
      <EditClusterModal
        isOpen={!!editCluster}
        onClose={() => setEditCluster(null)}
        cluster={editCluster}
      />

      {/* Kubeconfig View / Edit Modal */}
      {kubeconfigCluster && (
        <KubeconfigEditModal
          clusterId={kubeconfigCluster.id}
          clusterName={kubeconfigCluster.name}
          isOpen={!!kubeconfigCluster}
          onClose={() => setKubeconfigCluster(null)}
        />
      )}
    </div>
  );
}
