import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Server, Pencil, Trash2, Plus, Globe, ShieldCheck, Clock, AlertTriangle, Loader2, Eye, MonitorDot, Wifi, WifiOff, HelpCircle } from 'lucide-react';
import { useClusters, useUpdateCluster, useDeleteCluster } from '@/hooks/useCluster';
import { clustersApi, managementServersApi } from '@/services/api';
import { useClusterStore } from '@/stores/clusterStore';
import { AddClusterModal, KubeconfigEditModal } from '@/components/dashboard';
import { Cluster, ManagementServer, ManagementServerCreate } from '@/types';
import { getStatusIcon, formatDateTime } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

// ── Management Server Modal ─────────────────────────────────────────────────

const SERVER_TYPE_OPTIONS = [
  { value: 'jump_host', label: 'Jump Host' },
  { value: 'bastion', label: 'Bastion' },
  { value: 'admin', label: '관리 서버' },
  { value: 'monitoring', label: '모니터링' },
  { value: 'cicd', label: 'CI/CD' },
];

function ManagementServerModal({
  isOpen,
  onClose,
  server,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  server: ManagementServer | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ManagementServerCreate>({
    name: '',
    host: '',
    port: 22,
    username: '',
    serverType: 'jump_host',
    description: '',
    region: '',
    tags: '',
    osInfo: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (server) {
        setForm({
          name: server.name,
          host: server.host,
          port: server.port,
          username: server.username ?? '',
          serverType: server.serverType,
          description: server.description ?? '',
          region: server.region ?? '',
          tags: server.tags ?? '',
          osInfo: server.osInfo ?? '',
        });
      } else {
        setForm({ name: '', host: '', port: 22, username: '', serverType: 'jump_host', description: '', region: '', tags: '', osInfo: '' });
      }
      setError('');
    }
  }, [isOpen, server]);

  if (!isOpen) return null;

  const set = (k: keyof ManagementServerCreate, v: string | number) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) {
      setError('서버 이름과 호스트(IP)는 필수입니다.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (server) {
        await managementServersApi.update(server.id, form);
      } else {
        await managementServersApi.create(form);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(axiosErr.response?.data?.detail ?? axiosErr.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-5">{server ? '관리서버 수정' : '관리서버 추가'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">서버 이름 *</label>
              <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={saving} className={inputClass} placeholder="bastion-prod-01" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">호스트 / IP *</label>
              <input type="text" value={form.host} onChange={(e) => set('host', e.target.value)} disabled={saving} className={inputClass} placeholder="10.0.0.1" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">포트</label>
              <input type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} disabled={saving} className={inputClass} min={1} max={65535} />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">사용자명</label>
              <input type="text" value={form.username} onChange={(e) => set('username', e.target.value)} disabled={saving} className={inputClass} placeholder="root" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">서버 유형</label>
              <select value={form.serverType} onChange={(e) => set('serverType', e.target.value)} disabled={saving} className={inputClass}>
                {SERVER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">지역</label>
              <input type="text" value={form.region} onChange={(e) => set('region', e.target.value)} disabled={saving} className={inputClass} placeholder="KR-Seoul" />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">OS 정보</label>
              <input type="text" value={form.osInfo} onChange={(e) => set('osInfo', e.target.value)} disabled={saving} className={inputClass} placeholder="Ubuntu 22.04" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">태그 <span className="text-xs opacity-60">(쉼표 구분)</span></label>
              <input type="text" value={form.tags} onChange={(e) => set('tags', e.target.value)} disabled={saving} className={inputClass} placeholder="prod,infra,network" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">설명</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} disabled={saving} rows={2} className={inputClass + ' resize-none'} placeholder="서버 용도 및 설명" />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors disabled:opacity-40">취소</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Server Status Badge ─────────────────────────────────────────────────────

function ServerStatusBadge({ status }: { status: string }) {
  if (status === 'online') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
      <Wifi className="w-3 h-3" /> online
    </span>
  );
  if (status === 'offline') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
      <WifiOff className="w-3 h-3" /> offline
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border">
      <HelpCircle className="w-3 h-3" /> unknown
    </span>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export function SettingsPage() {
  // Cluster state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [kubeconfigCluster, setKubeconfigCluster] = useState<Cluster | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  // Management server state
  const [showServerModal, setShowServerModal] = useState(false);
  const [editServer, setEditServer] = useState<ManagementServer | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const { clusters } = useClusterStore();
  useClusters();

  const queryClient = useQueryClient();

  // Management servers query
  const { data: serversData, refetch: refetchServers } = useQuery({
    queryKey: ['management-servers'],
    queryFn: () => managementServersApi.getAll(),
  });
  const servers: ManagementServer[] = serversData?.data?.data ?? [];

  const deleteServerMutation = useMutation({
    mutationFn: (id: string) => managementServersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['management-servers'] }),
  });

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

  const handleVerify = async (cluster: Cluster) => {
    setVerifyingId(cluster.id);
    try {
      const res = await clustersApi.verify(cluster.id);
      const data = res.data;
      const summary = data.results
        .map((r) => `${r.check === 'api_server' ? 'API서버' : r.check === 'kubeconfig_auth' ? '인증' : '노드조회'}: ${r.ok === null ? '건너뜀' : r.ok ? '✓' : '✗'} ${r.detail}`)
        .join(' | ');
      setVerifyResults((prev) => ({ ...prev, [cluster.id]: { ok: data.ok, detail: summary } }));
    } catch {
      setVerifyResults((prev) => ({ ...prev, [cluster.id]: { ok: false, detail: '연결 확인 실패' } }));
    } finally {
      setVerifyingId(null);
    }
  };

  const handlePing = async (server: ManagementServer) => {
    setPingingId(server.id);
    try {
      const res = await managementServersApi.ping(server.id);
      const d = res.data;
      const detail = d.latency_ms != null ? `${d.latency_ms}ms — ${d.detail}` : d.detail;
      setPingResults((prev) => ({ ...prev, [server.id]: { ok: d.ok, detail } }));
      await refetchServers();
    } catch {
      setPingResults((prev) => ({ ...prev, [server.id]: { ok: false, detail: '핑 요청 실패' } }));
    } finally {
      setPingingId(null);
    }
  };

  const handleDeleteServer = async (server: ManagementServer) => {
    if (!confirm(`관리서버 "${server.name}"을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteServerMutation.mutateAsync(server.id);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      alert(`삭제 실패: ${axiosErr.response?.data?.detail ?? axiosErr.message ?? '삭제에 실패했습니다.'}`);
    }
  };

  const statusCounts = {
    healthy: clusters.filter((c) => c.status === 'healthy').length,
    warning: clusters.filter((c) => c.status === 'warning').length,
    critical: clusters.filter((c) => c.status === 'critical').length,
  };

  const serverTypeLabelMap: Record<string, string> = {
    jump_host: 'Jump Host',
    bastion: 'Bastion',
    admin: '관리',
    monitoring: '모니터링',
    cicd: 'CI/CD',
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
        <div className="bg-card border border-border rounded-xl mb-8">
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
                    {verifyResults[cluster.id] && (
                      <div className={`text-xs mt-1 px-2 py-1 rounded ${
                        verifyResults[cluster.id].ok
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {verifyResults[cluster.id].ok ? '✓ 연결 정상' : '✗ 연결 이상'} — {verifyResults[cluster.id].detail}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleVerify(cluster)}
                      disabled={verifyingId === cluster.id}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-primary disabled:opacity-40"
                      title="연결 확인"
                    >
                      {verifyingId === cluster.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                    </button>
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

        {/* Management Server List */}
        <div className="bg-card border border-border rounded-xl">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MonitorDot className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">관리서버</h2>
              <span className="text-xs text-muted-foreground ml-1">Jump Host / Bastion / 관리 서버</span>
            </div>
            <button
              onClick={() => { setEditServer(null); setShowServerModal(true); }}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              관리서버 추가
            </button>
          </div>

          {servers.length === 0 ? (
            <div className="text-center py-12">
              <MonitorDot className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm mb-4">등록된 관리서버가 없습니다.</p>
              <button
                onClick={() => { setEditServer(null); setShowServerModal(true); }}
                className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + 첫 번째 관리서버 등록
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {servers.map((server) => (
                <div key={server.id} className="px-6 py-4 flex items-start gap-4 hover:bg-muted/20 transition-colors">
                  <div className="mt-0.5">
                    <MonitorDot className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium">{server.name}</span>
                      <ServerStatusBadge status={server.status} />
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {serverTypeLabelMap[server.serverType] ?? server.serverType}
                      </span>
                      {server.region && (
                        <span className="text-xs text-muted-foreground">{server.region}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {server.host}:{server.port}
                      {server.username && <span className="text-xs ml-3 font-sans">user: {server.username}</span>}
                      {server.osInfo && <span className="text-xs ml-3 font-sans">{server.osInfo}</span>}
                    </div>
                    {server.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{server.description}</p>
                    )}
                    {server.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {server.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      등록일: {formatDateTime(server.createdAt)}
                      {server.lastChecked && <span className="ml-4">마지막 확인: {formatDateTime(server.lastChecked)}</span>}
                    </div>
                    {pingResults[server.id] && (
                      <div className={`text-xs mt-1 px-2 py-1 rounded ${
                        pingResults[server.id].ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {pingResults[server.id].ok ? '✓ 연결 확인됨' : '✗ 연결 실패'} — {pingResults[server.id].detail}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handlePing(server)}
                      disabled={pingingId === server.id}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-primary disabled:opacity-40"
                      title="연결 확인 (Ping)"
                    >
                      {pingingId === server.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditServer(server); setShowServerModal(true); }}
                      className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                      title="수정"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteServer(server)}
                      disabled={deleteServerMutation.isPending}
                      className="p-2 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
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

      {/* Add Cluster Modal */}
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

      {/* Management Server Add / Edit Modal */}
      <ManagementServerModal
        isOpen={showServerModal}
        onClose={() => { setShowServerModal(false); setEditServer(null); }}
        server={editServer}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['management-servers'] })}
      />
    </div>
  );
}
