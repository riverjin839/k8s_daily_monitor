import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clustersApi } from '@/services/api';
import { Cluster } from '@/types';
import {
  Plus,
  Trash2,
  Edit,
  Server,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';

interface ClusterFormData {
  name: string;
  api_endpoint: string;
  kubeconfig_path: string;
}

const initialFormData: ClusterFormData = {
  name: '',
  api_endpoint: '',
  kubeconfig_path: '/root/.kube/config',
};

export function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Cluster | null>(null);
  const [formData, setFormData] = useState<ClusterFormData>(initialFormData);

  // Fetch clusters
  const { data: clustersResponse, isLoading } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => clustersApi.getAll(),
  });

  const clusters = clustersResponse?.data || [];

  // Create cluster mutation
  const createMutation = useMutation({
    mutationFn: (data: ClusterFormData) => clustersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      closeModal();
    },
  });

  // Update cluster mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ClusterFormData> }) =>
      clustersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      closeModal();
    },
  });

  // Delete cluster mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => clustersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    },
  });

  const openModal = (cluster?: Cluster) => {
    if (cluster) {
      setEditingCluster(cluster);
      setFormData({
        name: cluster.name,
        api_endpoint: cluster.apiEndpoint,
        kubeconfig_path: cluster.kubeconfigPath || '/root/.kube/config',
      });
    } else {
      setEditingCluster(null);
      setFormData(initialFormData);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCluster(null);
    setFormData(initialFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCluster) {
      updateMutation.mutate({ id: editingCluster.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`정말 "${name}" 클러스터를 삭제하시겠습니까?`)) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Server className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      critical: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">클러스터 설정</h1>
                <p className="text-sm text-gray-500">K8s 클러스터 등록 및 관리</p>
              </div>
            </div>
            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              클러스터 추가
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-12">
            <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              등록된 클러스터가 없습니다
            </h3>
            <p className="text-gray-500 mb-4">
              새 클러스터를 추가하여 모니터링을 시작하세요
            </p>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              클러스터 추가
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {clusters.map((cluster: Cluster) => (
              <div
                key={cluster.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(cluster.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {cluster.name}
                      </h3>
                      <p className="text-sm text-gray-500">{cluster.apiEndpoint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(
                        cluster.status
                      )}`}
                    >
                      {cluster.status}
                    </span>
                    <button
                      onClick={() => openModal(cluster)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="수정"
                    >
                      <Edit className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(cluster.id, cluster.name)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
                {cluster.kubeconfigPath && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      Kubeconfig: {cluster.kubeconfigPath}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={closeModal}
            />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingCluster ? '클러스터 수정' : '새 클러스터 추가'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    클러스터 이름
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="예: dev-cluster, prod-cluster"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Server 주소
                  </label>
                  <input
                    type="text"
                    value={formData.api_endpoint}
                    onChange={(e) =>
                      setFormData({ ...formData, api_endpoint: e.target.value })
                    }
                    placeholder="예: https://10.61.162.101:6443"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kubeconfig 경로
                  </label>
                  <input
                    type="text"
                    value={formData.kubeconfig_path}
                    onChange={(e) =>
                      setFormData({ ...formData, kubeconfig_path: e.target.value })
                    }
                    placeholder="/root/.kube/config"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? '저장 중...'
                      : '저장'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
