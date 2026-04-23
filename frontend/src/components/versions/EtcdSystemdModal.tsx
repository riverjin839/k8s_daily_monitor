import { useEffect, useMemo, useState } from 'react';
import { X, Server, Play, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { bulkExecApi, versionsApi } from '@/services/api';
import type { NodeSummary } from '@/services/api';
import type { EtcdSystemdCollectResponse } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { useAbortableMutation } from '@/hooks/useAbortableMutation';

interface Props {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}

/** 클러스터의 master 노드에 SSH 로 접속해 etcd (systemd) 상태/버전을 수집하는 모달.
 *  SSH 자격증명은 요청에만 사용되고 DB 에 저장되지 않는다.
 */
export function EtcdSystemdModal({ open, clusterId, onClose }: Props) {
  const [username, setUsername] = useState('root');
  const [port, setPort] = useState(22);
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState('etcd');
  const [useSudo, setUseSudo] = useState(true);
  const [result, setResult] = useState<EtcdSystemdCollectResponse | null>(null);

  const nodeQ = useQuery({
    queryKey: ['etcd-systemd-nodes', clusterId],
    queryFn: () => bulkExecApi.nodeList(clusterId).then((r) => r.data.nodes),
    enabled: open && !!clusterId,
  });
  const nodes: NodeSummary[] = useMemo(() => nodeQ.data ?? [], [nodeQ.data]);

  // 처음 열릴 때 control-plane 노드 자동 선택
  useEffect(() => {
    if (!open) return;
    if (nodes.length === 0) return;
    const masters = nodes.filter((n) => n.roles.includes('control-plane'));
    const target = masters.length > 0 ? masters : nodes;
    setSelected(new Set(target.map((n) => n.internalIp || n.name).filter(Boolean) as string[]));
  }, [open, nodes]);

  const collectMut = useAbortableMutation({
    mutationFn: async (_: void, signal) => {
      const r = await versionsApi.collectEtcdSystemd(clusterId, {
        hosts: Array.from(selected),
        port,
        username,
        password: authMode === 'password' ? password : undefined,
        privateKey: authMode === 'key' ? privateKey : undefined,
        useSudo,
      }, signal);
      return r.data;
    },
    onSuccess: (d) => setResult(d),
  });

  const canRun = selected.size > 0
    && (authMode === 'password' ? !!password : !!privateKey.trim());

  const runErr = collectMut.error as { response?: { data?: { detail?: string } }; message?: string } | null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => !collectMut.isPending && onClose()} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Server className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">etcd (systemd) 수집</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              master 노드에 SSH 접속 → <span className="font-mono">systemctl show {unit}</span> + <span className="font-mono">etcd --version</span>
            </p>
          </div>
          <button onClick={onClose} disabled={collectMut.isPending}
            className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 max-h-[520px] overflow-y-auto space-y-4">
          {/* 자격증명 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">SSH User</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-2 py-1 text-sm font-mono bg-background border border-border rounded-lg" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">SSH Port</label>
              <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 22)}
                min={1} max={65535}
                className="w-full px-2 py-1 text-sm font-mono bg-background border border-border rounded-lg" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">systemd unit</label>
              <input value={unit} onChange={(e) => setUnit(e.target.value)}
                placeholder="etcd"
                className="w-full px-2 py-1 text-sm font-mono bg-background border border-border rounded-lg" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center bg-secondary/60 rounded-lg p-[3px] gap-px">
                {(['password', 'key'] as const).map((m) => (
                  <button key={m} onClick={() => setAuthMode(m)}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded-md ${
                      authMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/80 hover:text-foreground'
                    }`}>
                    {m === 'password' ? '비밀번호' : '개인키'}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">자격증명은 요청에만 사용되고 저장되지 않습니다.</span>
            </div>
            {authMode === 'password' ? (
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="SSH 비밀번호"
                className="w-full px-2 py-1 text-sm font-mono bg-background border border-border rounded-lg" />
            ) : (
              <textarea value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                rows={3}
                className="w-full px-2 py-1 text-xs font-mono bg-background border border-border rounded-lg" />
            )}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-foreground/80">
            <input type="checkbox" checked={useSudo} onChange={(e) => setUseSudo(e.target.checked)} />
            sudo 사용
          </label>

          {/* 노드 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-muted-foreground">대상 노드 ({selected.size} / {nodes.length})</label>
              <div className="flex gap-1">
                <button onClick={() => setSelected(new Set(nodes.map((n) => n.internalIp || n.name).filter(Boolean) as string[]))}
                  className="text-[10px] text-primary hover:underline">모두</button>
                <button onClick={() => setSelected(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground">해제</button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg bg-background p-1">
              {nodes.length === 0 ? (
                <p className="text-center py-3 text-xs text-muted-foreground">
                  {nodeQ.isLoading ? '노드 로딩 중...' : '노드 없음'}
                </p>
              ) : nodes.map((n) => {
                const host = n.internalIp || n.name;
                const on = selected.has(host);
                const isMaster = n.roles.includes('control-plane');
                return (
                  <label key={n.name}
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${
                      on ? 'bg-primary/5' : 'hover:bg-muted/30'
                    }`}>
                    <input type="checkbox" checked={on}
                      onChange={() => setSelected((s) => {
                        const next = new Set(s);
                        if (next.has(host)) next.delete(host); else next.add(host);
                        return next;
                      })} />
                    <span className="font-mono text-foreground">{n.name}</span>
                    <span className="text-muted-foreground">{n.internalIp ?? ''}</span>
                    {isMaster && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        master
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {runErr && (
            <div className="px-3 py-2 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/30">
              {runErr.response?.data?.detail ?? runErr.message}
            </div>
          )}

          {/* 결과 */}
          {result && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                {result.stored
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                <span className="text-xs font-semibold">
                  {result.stored ? '새 스냅샷 저장됨' : '변경 없음 (저장 안 함)'}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">component: {result.componentKey}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left text-[10px] text-muted-foreground">
                      <th className="px-2 py-1">Host</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Active</th>
                      <th className="px-2 py-1">PID</th>
                      <th className="px-2 py-1">Version</th>
                      <th className="px-2 py-1">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.hosts.map((h) => (
                      <tr key={h.host} className="border-t border-border">
                        <td className="px-2 py-1 font-mono">{h.host}</td>
                        <td className="px-2 py-1">
                          {h.status === 'ok'
                            ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            : <XCircle className="w-3 h-3 text-red-400" />}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{h.activeState ?? '-'}</td>
                        <td className="px-2 py-1 font-mono text-muted-foreground">{h.mainPid ?? '-'}</td>
                        <td className="px-2 py-1 font-mono">{h.version ?? '-'}</td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-[200px]" title={h.fragmentPath ?? ''}>
                          {h.fragmentPath ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.errors.length > 0 && (
                <div className="px-3 py-2 text-[11px] text-amber-400 border-t border-border bg-amber-500/5">
                  {result.errors.length}건 오류: {result.errors.slice(0, 3).join(' / ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
          <button onClick={onClose} disabled={collectMut.isPending}
            className="px-4 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg disabled:opacity-40">
            닫기
          </button>
          {collectMut.isPending ? (
            <button onClick={collectMut.abort}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-red-500 text-primary-foreground rounded-lg hover:bg-red-600">
              <Loader2 className="w-3 h-3 animate-spin" /> 중지
            </button>
          ) : (
            <button onClick={() => collectMut.mutate()}
              disabled={!canRun}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
              <Play className="w-3 h-3" /> 수집 실행
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
