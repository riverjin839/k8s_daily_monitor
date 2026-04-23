import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAbortableMutation } from '@/hooks/useAbortableMutation';
import {
  Terminal, RefreshCw, Play, Square, CheckCircle, XCircle, Key, Upload, ChevronDown, ChevronRight,
  Wifi, FileText, ShieldAlert, Zap, Clock,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { ConfirmDialog, LogViewer, ClusterSidebar, SavedCommands, DebugLogPanel } from '@/components/common';
import { bulkExecApi, type NodeSummary, type BulkExecResponse, type BulkExecResultItem } from '@/services/api';
import { formatApiError } from '@/lib/utils';

// ── 상태 색상 ───────────────────────────────────────────────────────────────

const STATUS_META: Record<BulkExecResultItem['status'], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok:            { label: '정상',     cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',  icon: CheckCircle },
  error:         { label: '에러',     cls: 'bg-red-500/10 text-red-400 border-red-500/30',              icon: XCircle },
  timeout:       { label: '타임아웃', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',        icon: Clock },
  auth_error:    { label: '인증 실패', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/30',    icon: ShieldAlert },
  connect_error: { label: '연결 실패', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30',       icon: Wifi },
};

// ── Node row ────────────────────────────────────────────────────────────────

function NodeRow({ node, checked, onToggle }: { node: NodeSummary; checked: boolean; onToggle: () => void }) {
  const host = node.internalIp || node.name;
  return (
    <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors ${
      checked ? 'bg-primary/5' : ''
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 accent-primary flex-shrink-0"
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${node.ready ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <span className="font-mono text-sm text-foreground truncate">{node.name}</span>
        <span className="text-xs font-mono text-muted-foreground">{host}</span>
        {node.roles.map((r) => (
          <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{r}</span>
        ))}
      </div>
      {node.kubeletVersion && (
        <span className="text-[10px] font-mono text-muted-foreground">{node.kubeletVersion}</span>
      )}
    </label>
  );
}

// ── Result row ──────────────────────────────────────────────────────────────

function ResultRow({ result, globalFilter }: { result: BulkExecResultItem; globalFilter: string }) {
  const [expanded, setExpanded] = useState(result.status !== 'ok');
  const meta = STATUS_META[result.status];
  const Icon = meta.icon;

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 transition-colors">
        <td className="px-3 py-2 w-7">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-sm">{result.host}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}>
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </td>
        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
          {result.exitCode === null || result.exitCode === undefined ? '-' : result.exitCode}
        </td>
        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{result.durationMs}ms</td>
        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[320px] truncate" title={result.error ?? ''}>
          {result.error ?? (result.stdout.split('\n')[0].slice(0, 80) || '-')}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={6} className="px-5 py-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stdout</p>
                <LogViewer text={result.stdout} maxHeight="max-h-72"
                  filterOverride={globalFilter || undefined}
                  hideToolbar={!!globalFilter.trim()} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stderr</p>
                <LogViewer text={result.stderr} maxHeight="max-h-72" asError
                  filterOverride={globalFilter || undefined}
                  hideToolbar={!!globalFilter.trim()} />
              </div>
            </div>
            {result.error && (
              <p className="text-xs text-red-400 mt-2">⚠ {result.error}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export function BulkExecPage() {
  const { data: clusters = [] } = useClusters();
  const [clusterId, setClusterId] = useState('');
  useEffect(() => {
    if (!clusterId && clusters.length > 0) setClusterId(clusters[0].id);
  }, [clusters, clusterId]);

  const nodesQ = useQuery({
    queryKey: ['bulk-exec', 'nodes', clusterId],
    queryFn: () => bulkExecApi.nodeList(clusterId).then((r) => r.data),
    enabled: !!clusterId,
    staleTime: 30_000,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 클러스터 바뀌면 선택 초기화
  useEffect(() => { setSelected(new Set()); }, [clusterId]);

  const toggle = (name: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const toggleAll = () => {
    const all = (nodesQ.data?.nodes ?? []).map((n) => n.name);
    setSelected((prev) => prev.size === all.length ? new Set() : new Set(all));
  };

  // 실행 구성
  const [action, setAction] = useState<'ssh' | 'scp'>('ssh');
  const [username, setUsername] = useState('root');
  const [port, setPort] = useState(22);
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [command, setCommand] = useState('');
  const [scpContent, setScpContent] = useState('');
  const [scpRemotePath, setScpRemotePath] = useState('/tmp/uploaded.txt');
  const [mode, setMode] = useState<'sequential' | 'parallel'>('parallel');
  const [parallelism, setParallelism] = useState(10);
  const [connectTimeout, setConnectTimeout] = useState(8);
  const [execTimeout, setExecTimeout] = useState(60);
  const [chunkSize, setChunkSize] = useState(30);
  const [chunkPauseMs, setChunkPauseMs] = useState(200);

  const selectedHosts = useMemo(() => {
    const byName = new Map((nodesQ.data?.nodes ?? []).map((n) => [n.name, n]));
    return Array.from(selected).map((name) => {
      const n = byName.get(name);
      return { name, host: n?.internalIp || n?.name || name };
    });
  }, [selected, nodesQ.data]);

  const [runResponse, setRunResponse] = useState<BulkExecResponse | null>(null);

  const runMutation = useAbortableMutation({
    mutationFn: async (_: void, signal) => {
      const res = await bulkExecApi.run({
        clusterId: clusterId || undefined,
        action,
        targets: selectedHosts.map((t) => ({ host: t.host })),
        username,
        port,
        password: authMode === 'password' ? password : undefined,
        privateKey: authMode === 'key' ? privateKey : undefined,
        command: action === 'ssh' ? command : undefined,
        scpContent: action === 'scp' ? scpContent : undefined,
        scpRemotePath: action === 'scp' ? scpRemotePath : undefined,
        mode,
        parallelism,
        connectTimeout,
        execTimeout,
        chunkSize,
        chunkPauseMs,
      }, signal);
      return res.data;
    },
    onSuccess: (data) => setRunResponse(data),
  });

  const canRun =
    !!clusterId &&
    selected.size > 0 &&
    (authMode === 'password' ? !!password : !!privateKey.trim()) &&
    (action === 'ssh' ? !!command.trim() : !!scpRemotePath.trim());

  const runError = runMutation.error as { response?: { data?: { detail?: string } }; message?: string } | null;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1800px] mx-auto px-6 py-6 flex gap-5">
        {/* 좌측: 클러스터 사이드바 */}
        <ClusterSidebar
          clusters={clusters}
          selectedId={clusterId || null}
          onSelect={(id) => setClusterId(id ?? '')}
        />

        <div className="flex-1 min-w-0">
        <DebugLogPanel pageKey="bulk-exec" extra={{ clusterId, selected: selected.size, action, mode, pending: runMutation.isPending }} />
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Terminal className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">노드 일괄 실행 (SSH / SCP)</h1>
            {nodesQ.data?.nodes && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                선택 {selected.size} / {nodesQ.data.nodes.length}
              </span>
            )}
          </div>
          <button
            onClick={() => nodesQ.refetch()}
            disabled={!clusterId}
            className="p-2 bg-secondary hover:bg-secondary/80 rounded-lg text-muted-foreground disabled:opacity-50"
            title="노드 목록 새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${nodesQ.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 왼쪽: 노드 선택 */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <header className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <h2 className="text-sm font-semibold">타겟 노드</h2>
              <button
                onClick={toggleAll}
                disabled={!nodesQ.data?.nodes?.length}
                className="text-xs text-primary hover:text-primary/80 disabled:opacity-40"
              >
                {selected.size === (nodesQ.data?.nodes?.length ?? 0) ? '전체 해제' : '전체 선택'}
              </button>
            </header>
            <div className="max-h-[520px] overflow-y-auto">
              {!clusterId ? (
                <p className="text-center text-muted-foreground text-sm py-10">클러스터를 선택하세요.</p>
              ) : nodesQ.isLoading ? (
                <p className="text-center text-muted-foreground text-sm py-10">불러오는 중…</p>
              ) : nodesQ.isError ? (
                <p className="text-center text-red-400 text-sm py-10 px-4">
                  {(nodesQ.error as Error)?.message ?? '노드 조회 실패'}
                </p>
              ) : (nodesQ.data?.nodes ?? []).length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-10">노드 없음</p>
              ) : (
                (nodesQ.data!.nodes).map((n) => (
                  <NodeRow key={n.name} node={n} checked={selected.has(n.name)} onToggle={() => toggle(n.name)} />
                ))
              )}
            </div>
          </section>

          {/* 오른쪽: 실행 구성 */}
          <section className="lg:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
            {/* Action 토글 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-secondary/60 rounded-lg p-[3px] gap-px">
                {(['ssh', 'scp'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      action === a
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground/70 hover:text-foreground'
                    }`}
                  >
                    {a === 'ssh' ? '명령 실행 (ssh)' : '파일 업로드 (scp)'}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-secondary/60 rounded-lg p-[3px] gap-px">
                {(['parallel', 'sequential'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      mode === m
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground/70 hover:text-foreground'
                    }`}
                  >
                    {m === 'parallel' ? <><Zap className="w-3 h-3 inline mr-1" />병렬</> : '순차'}
                  </button>
                ))}
              </div>
              {mode === 'parallel' && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                  동시성
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={parallelism}
                    onChange={(e) => setParallelism(Number(e.target.value) || 1)}
                    className="w-14 px-2 py-1 bg-background border border-border rounded text-xs"
                  />
                </label>
              )}
            </div>

            {/* 인증 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">사용자</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">포트</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value) || 22)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">인증 방식</label>
                <div className="flex items-center bg-secondary/60 rounded-lg p-[3px] gap-px">
                  {(['password', 'key'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAuthMode(m)}
                      className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
                        authMode === m
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground/70 hover:text-foreground'
                      }`}
                    >
                      {m === 'password' ? '비밀번호' : 'Private Key'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {authMode === 'password' ? (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="SSH 비밀번호"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Key className="w-3 h-3" /> Private Key (PEM)
                </label>
                <textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY----- ..."
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">RSA / Ed25519 / ECDSA / DSS 지원. 비밀번호 보호된 키는 지원 안 함.</p>
              </div>
            )}

            {/* 명령/파일 */}
            {action === 'ssh' ? (
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Terminal className="w-3 h-3" /> 실행할 명령
                </label>
                <textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="예: uname -a && free -m && uptime"
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <SavedCommands
                  className="mt-2"
                  storageKey="k8s:saved-cmd:bulk-exec-ssh"
                  currentValue={command}
                  onPick={setCommand}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> 업로드할 내용
                  </label>
                  <textarea
                    value={scpContent}
                    onChange={(e) => setScpContent(e.target.value)}
                    placeholder="업로드할 파일 내용"
                    rows={4}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="mt-1 flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                      <Upload className="w-3 h-3" /> 파일에서 불러오기
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            if (typeof ev.target?.result === 'string') setScpContent(ev.target.result);
                          };
                          reader.readAsText(f);
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">원격 경로</label>
                  <input
                    type="text"
                    value={scpRemotePath}
                    onChange={(e) => setScpRemotePath(e.target.value)}
                    placeholder="/tmp/uploaded.txt"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* 타임아웃 */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                connect timeout
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={connectTimeout}
                  onChange={(e) => setConnectTimeout(Number(e.target.value) || 8)}
                  className="w-14 px-2 py-1 bg-background border border-border rounded text-xs"
                />s
              </label>
              <label className="flex items-center gap-1.5">
                exec timeout
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={execTimeout}
                  onChange={(e) => setExecTimeout(Number(e.target.value) || 60)}
                  className="w-16 px-2 py-1 bg-background border border-border rounded text-xs"
                />s
              </label>
              <span className="text-border">·</span>
              <label className="flex items-center gap-1.5" title="한 청크에서 병렬 실행할 호스트 수. 청크 완료 후 휴지 → 다음 청크.">
                chunk
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value) || 30)}
                  className="w-14 px-2 py-1 bg-background border border-border rounded text-xs"
                />개
              </label>
              <label className="flex items-center gap-1.5" title="청크 사이 휴지 시간 (ms). 베스천/게이트웨이 burst 부하 완화.">
                pause
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={50}
                  value={chunkPauseMs}
                  onChange={(e) => setChunkPauseMs(Number(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-background border border-border rounded text-xs"
                />ms
              </label>
            </div>

            {/* 대규모 실행 예상 시간 힌트 */}
            {selected.size >= 50 && (
              <div className="px-3 py-2 text-[11px] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 flex items-start gap-2">
                <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  선택 {selected.size}개 호스트 · parallelism {parallelism} / chunk {chunkSize}개 ·
                  예상 소요 시간 <strong className="font-mono">최소 {Math.ceil(selected.size / chunkSize) * Math.ceil(execTimeout / 10)}초 ~ 최대 {Math.ceil(selected.size / chunkSize) * (execTimeout + connectTimeout)}초</strong>.
                  실행 중 버튼이 "중지"로 바뀌며 언제든 취소 가능.
                </div>
              </div>
            )}

            {runError && (
              <div className="px-3 py-2 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/30">
                {formatApiError(runError, '실행 중 오류')}
              </div>
            )}

            {/* 실행 */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                인증 정보는 이 실행에만 사용되고 저장되지 않습니다.
              </p>
              {runMutation.isPending ? (
                <button
                  onClick={runMutation.abort}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-red-500 hover:bg-red-600 text-primary-foreground rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 fill-current" />
                  중지
                </button>
              ) : (
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canRun}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  실행 ({selected.size} 노드)
                </button>
              )}
            </div>
          </section>
        </div>

        {/* 결과 테이블 */}
        {runResponse && (
          <section className="mt-6 bg-card border border-border rounded-xl overflow-hidden">
            <header className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold">실행 결과</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  성공 {runResponse.okCount}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                  실패 {runResponse.errorCount}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  총 {runResponse.totalDurationMs}ms · {runResponse.mode} · {runResponse.action}
                </span>
                <div className="ml-auto relative">
                  <input
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    placeholder="모든 노드 결과 공통 필터..."
                    className="pl-2 pr-7 py-1 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-64"
                  />
                  {globalFilter && (
                    <button
                      onClick={() => setGlobalFilter('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >×</button>
                  )}
                </div>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="w-7"></th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">호스트</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">상태</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">exit</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">소요</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">요약</th>
                  </tr>
                </thead>
                <tbody>
                  {runResponse.results.map((r) => (
                    <ResultRow key={r.host} result={r} globalFilter={globalFilter} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        </div>
      </main>

      {/* 실행 확인 모달 */}
      <ConfirmDialog
        open={confirmOpen}
        title={action === 'ssh' ? '노드 일괄 SSH 실행 확인' : '노드 일괄 SCP 업로드 확인'}
        description={`이 작업은 ${selected.size}개 노드에 ${mode === 'parallel' ? '병렬' : '순차'}로 실행됩니다.`}
        confirmLabel={action === 'ssh' ? '실행' : '업로드'}
        danger={action === 'ssh'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); runMutation.mutate(); }}
      >
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">접속 정보</p>
            <p className="font-mono">
              <span className="text-primary">{username}</span>
              <span className="text-muted-foreground">@</span>
              <span className="text-foreground">(선택된 {selected.size}개 host)</span>
              <span className="text-muted-foreground">:{port}</span>
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary">
                {authMode === 'password' ? '비밀번호' : 'Private Key'}
              </span>
            </p>
          </div>
          {action === 'ssh' ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">실행할 명령</p>
              <pre className="text-[11px] font-mono bg-background border border-border rounded p-2 max-h-28 overflow-auto whitespace-pre-wrap break-all">
                {command}
              </pre>
            </div>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">업로드 대상</p>
              <p className="font-mono">{scpRemotePath}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                크기: {new Blob([scpContent]).size} bytes
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">대상 호스트</p>
            <div className="text-[11px] font-mono max-h-24 overflow-auto bg-background border border-border rounded p-2">
              {selectedHosts.slice(0, 10).map((t) => (
                <div key={t.name}>
                  <span className="text-foreground">{t.name}</span>
                  {t.host !== t.name && <span className="text-muted-foreground"> ({t.host})</span>}
                </div>
              ))}
              {selectedHosts.length > 10 && (
                <div className="text-muted-foreground">+ {selectedHosts.length - 10}개 더…</div>
              )}
            </div>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
