import { useRef, useState } from 'react';
import { X, AlertTriangle, Loader2, FolderOpen, FileText, Upload } from 'lucide-react';
import { useCreateCluster } from '@/hooks/useCluster';

interface AddClusterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type KubeconfigMode = 'path' | 'content';

function extractApiError(err: unknown): string {
  if (!err) return 'Failed to create cluster';
  const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
  if (axiosErr.response?.data?.detail) return axiosErr.response.data.detail;
  if (axiosErr.message) return axiosErr.message;
  return String(err);
}

export function AddClusterModal({ isOpen, onClose }: AddClusterModalProps) {
  const [name, setName] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [kubeconfigMode, setKubeconfigMode] = useState<KubeconfigMode>('path');
  const [kubeconfigPath, setKubeconfigPath] = useState('');
  const [kubeconfigContent, setKubeconfigContent] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createCluster = useCreateCluster();
  const isVerifying = createCluster.isPending;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') setKubeconfigContent(text);
    };
    reader.readAsText(file);
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const handleClose = () => {
    if (isVerifying) return;
    setName('');
    setApiEndpoint('');
    setKubeconfigMode('path');
    setKubeconfigPath('');
    setKubeconfigContent('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !apiEndpoint.trim()) {
      setError('클러스터 이름과 API Endpoint는 필수입니다.');
      return;
    }

    try {
      await createCluster.mutateAsync({
        name: name.trim(),
        apiEndpoint: apiEndpoint.trim(),
        ...(kubeconfigMode === 'path' && kubeconfigPath.trim()
          ? { kubeconfigPath: kubeconfigPath.trim() }
          : {}),
        ...(kubeconfigMode === 'content' && kubeconfigContent.trim()
          ? { kubeconfigContent: kubeconfigContent.trim() }
          : {}),
      });
      handleClose();
    } catch (err: unknown) {
      setError(extractApiError(err));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add Cluster</h2>
          <button
            onClick={handleClose}
            disabled={isVerifying}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-40"
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
              disabled={isVerifying}
              placeholder="e.g. kind-dev, prod-cluster-01"
              className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
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
              disabled={isVerifying}
              placeholder="e.g. https://127.0.0.1:6443"
              className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              kubectl config view --minify -o jsonpath='&#123;.clusters[0].cluster.server&#125;'
            </p>
          </div>

          {/* Kubeconfig section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-muted-foreground">
                Kubeconfig
                <span className="ml-1 text-xs text-muted-foreground/60">(노드 라벨 기능 사용 시 필수)</span>
              </label>
              {/* Mode toggle */}
              <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5 text-xs">
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => setKubeconfigMode('path')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors disabled:opacity-50 ${
                    kubeconfigMode === 'path'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FolderOpen className="w-3 h-3" />
                  파일 경로
                </button>
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => setKubeconfigMode('content')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors disabled:opacity-50 ${
                    kubeconfigMode === 'content'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  직접 입력
                </button>
              </div>
            </div>

            {kubeconfigMode === 'path' ? (
              <input
                type="text"
                value={kubeconfigPath}
                onChange={(e) => setKubeconfigPath(e.target.value)}
                disabled={isVerifying}
                placeholder="e.g. /root/.kube/config"
                className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50"
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  value={kubeconfigContent}
                  onChange={(e) => setKubeconfigContent(e.target.value)}
                  disabled={isVerifying}
                  placeholder="kubeconfig YAML 내용을 붙여넣으세요..."
                  rows={6}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 resize-none"
                />
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  파일에서 불러오기
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yaml,.yml,.conf,.config"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* 연결 검증 중 안내 */}
          {isVerifying && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-400">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span>클러스터 연결을 검증 중입니다... (최대 5초)</span>
            </div>
          )}

          {/* Error */}
          {error && !isVerifying && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isVerifying}
              className="px-4 py-2.5 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-5 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
              {isVerifying ? '연결 검증 중...' : 'Add Cluster'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
