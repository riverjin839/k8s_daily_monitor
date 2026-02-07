import { useState } from 'react';
import { X } from 'lucide-react';
import { useCreateCluster } from '@/hooks/useCluster';

interface AddClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddClusterModal({ isOpen, onClose }: AddClusterModalProps) {
  const [name, setName] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [kubeconfigPath, setKubeconfigPath] = useState('');
  const [error, setError] = useState('');

  const createCluster = useCreateCluster();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !apiEndpoint.trim()) {
      setError('Name and API Endpoint are required');
      return;
    }

    try {
      await createCluster.mutateAsync({
        name: name.trim(),
        apiEndpoint: apiEndpoint.trim(),
        kubeconfigPath: kubeconfigPath.trim() || undefined,
      });
      // 성공 시 초기화 및 닫기
      setName('');
      setApiEndpoint('');
      setKubeconfigPath('');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create cluster';
      setError(message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add Cluster</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cluster Name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Cluster Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. kind-dev, prod-cluster-01"
              className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              API Endpoint *
            </label>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="e.g. https://127.0.0.1:6443"
              className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              kubectl config view --minify -o jsonpath='&#123;.clusters[0].cluster.server&#125;'
            </p>
          </div>

          {/* Kubeconfig Path */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              Kubeconfig Path
            </label>
            <input
              type="text"
              value={kubeconfigPath}
              onChange={(e) => setKubeconfigPath(e.target.value)}
              placeholder="e.g. /root/.kube/config (optional)"
              className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createCluster.isPending}
              className="px-5 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50"
            >
              {createCluster.isPending ? 'Adding...' : 'Add Cluster'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
