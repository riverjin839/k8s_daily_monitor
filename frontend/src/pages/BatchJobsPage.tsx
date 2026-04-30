import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle, Clock, Play, Plus, ShieldAlert, Trash2, Wifi, XCircle, ListTree,
} from 'lucide-react';

import { MacCard } from '@/components/ui/MacCard';
import { ConfirmDialog, LogViewer, MasterHostPicker } from '@/components/common';
import { useClusters } from '@/hooks/useCluster';
import {
  useBatchJobRuns,
  useBatchJobTypes,
  useBatchJobs,
  useCreateBatchJob,
  useDeleteBatchJob,
  useRunBatchJob,
} from '@/hooks/useBatchJobs';
import type { BatchJob, BatchJobRun } from '@/services/api';
import { formatApiError } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ok:            { label: '정상',     cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',  Icon: CheckCircle },
  error:         { label: '에러',     cls: 'bg-red-500/10 text-red-600 border-red-500/30',              Icon: XCircle },
  timeout:       { label: '타임아웃', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30',        Icon: Clock },
  auth_error:    { label: '인증 실패', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/30',    Icon: ShieldAlert },
  connect_error: { label: '연결 실패', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/30',       Icon: Wifi },
  running:       { label: '실행 중',   cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30',          Icon: Play },
  unknown:       { label: '미실행',   cls: 'bg-muted text-muted-foreground border-border',              Icon: Clock },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

interface CreateJobModalProps {
  open: boolean;
  clusterId: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateJobModal({ open, clusterId, onClose, onCreated }: CreateJobModalProps) {
  const typesQ = useBatchJobTypes();
  const create = useCreateBatchJob();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [defaultHost, setDefaultHost] = useState('');
  const [hostSelectedName, setHostSelectedName] = useState('');
  const [hostCustom, setHostCustom] = useState('');
  const [defaultPort, setDefaultPort] = useState(22);
  const [defaultUsername, setDefaultUsername] = useState('root');
  const [cron, setCron] = useState('');
  const [paramsJson, setParamsJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const selectedType = useMemo(
    () => typesQ.data?.find((t) => t.jobType === jobType),
    [typesQ.data, jobType],
  );

  useEffect(() => {
    if (!open) return;
    if (!jobType && typesQ.data && typesQ.data.length > 0) {
      setJobType(typesQ.data[0].jobType);
    }
  }, [open, typesQ.data, jobType]);

  useEffect(() => {
    if (selectedType) {
      setParamsJson(JSON.stringify(selectedType.defaultParams ?? {}, null, 2));
      if (!name) setName(selectedType.label);
      if (!description) setDescription(selectedType.description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.jobType]);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    let params: Record<string, unknown> = {};
    try {
      params = paramsJson.trim() ? JSON.parse(paramsJson) : {};
    } catch {
      setError('params JSON 파싱 실패 — 올바른 JSON 인지 확인해주세요.');
      return;
    }
    if (!name.trim() || !jobType || !clusterId) {
      setError('name, jobType, cluster 는 필수입니다.');
      return;
    }
    try {
      await create.mutateAsync({
        clusterId,
        name: name.trim(),
        description: description.trim() || undefined,
        jobType,
        defaultHost: defaultHost.trim() || undefined,
        defaultPort,
        defaultUsername: defaultUsername.trim() || 'root',
        cron: cron.trim() || undefined,
        params,
      });
      onCreated();
      onClose();
      setName(''); setDescription(''); setDefaultHost(''); setCron('');
      setHostSelectedName(''); setHostCustom('');
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">새 배치 잡 등록</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Job Type</label>
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            >
              <option value="">선택하세요…</option>
              {(typesQ.data ?? []).map((t) => (
                <option key={t.jobType} value={t.jobType}>
                  {t.label} ({t.jobType})
                </option>
              ))}
            </select>
            {selectedType?.description && (
              <p className="mt-1 text-[11px] text-muted-foreground">{selectedType.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">cron (선택)</label>
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 3 * * *"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">설명</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <MasterHostPicker
                clusterId={clusterId}
                customHost={hostCustom}
                selectedName={hostSelectedName}
                label="기본 호스트 (master 노드 후보)"
                onChange={({ selectedName, customHost, effectiveHost }) => {
                  setHostSelectedName(selectedName);
                  setHostCustom(customHost);
                  setDefaultHost(effectiveHost);
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">포트</label>
              <input
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(Number(e.target.value) || 22)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">기본 사용자</label>
            <input
              value={defaultUsername}
              onChange={(e) => setDefaultUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">params (JSON)</label>
            <textarea
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono"
            />
            {selectedType && Object.keys(selectedType.paramSchema).length > 0 && (
              <details className="mt-2 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">사용 가능한 파라미터</summary>
                <ul className="mt-1 space-y-1 pl-3">
                  {Object.entries(selectedType.paramSchema).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-mono">{k}</span>
                      <span className="opacity-60"> ({v.type})</span>
                      {v.help && <span> — {v.help}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-xl bg-secondary text-secondary-foreground">
            취소
          </button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            {create.isPending ? '등록 중…' : '등록'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface RunModalProps {
  job: BatchJob;
  onClose: () => void;
}

function RunModal({ job, onClose }: RunModalProps) {
  const run = useRunBatchJob();
  const [host, setHost] = useState(job.defaultHost ?? '');
  // 직접 입력이 비어있을 때만 master 후보 드롭다운을 따라간다.
  const [hostSelectedName, setHostSelectedName] = useState('');
  const [hostCustom, setHostCustom] = useState(job.defaultHost ?? '');
  const [port, setPort] = useState(job.defaultPort);
  const [username, setUsername] = useState(job.defaultUsername);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [paramOverrideJson, setParamOverrideJson] = useState('');
  const [timeout, setTimeoutSec] = useState(120);
  const [result, setResult] = useState<BatchJobRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!host.trim()) { setError('호스트를 입력해주세요.'); return; }
    if (!password && !privateKey) { setError('비밀번호 또는 개인키 중 하나는 필수입니다.'); return; }
    let paramOverride: Record<string, unknown> | undefined;
    if (paramOverrideJson.trim()) {
      try {
        paramOverride = JSON.parse(paramOverrideJson);
      } catch {
        setError('paramOverride JSON 파싱 실패.');
        return;
      }
    }
    try {
      const { data } = await run.mutateAsync({
        id: job.id,
        payload: {
          host: host.trim(),
          port,
          username: username.trim() || 'root',
          password: password || undefined,
          privateKey: privateKey || undefined,
          paramOverride,
          timeout,
        },
      });
      setResult(data);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{job.name} 실행</h3>
            <p className="text-[11px] text-muted-foreground font-mono">{job.jobType}</p>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <MasterHostPicker
                clusterId={job.clusterId}
                customHost={hostCustom}
                selectedName={hostSelectedName}
                label="호스트 (master 노드 후보)"
                onChange={({ selectedName, customHost, effectiveHost }) => {
                  setHostSelectedName(selectedName);
                  setHostCustom(customHost);
                  setHost(effectiveHost);
                }}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">포트</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 22)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">사용자</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">타임아웃 (초)</label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutSec(Number(e.target.value) || 60)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">비밀번호 (또는 개인키)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">개인키 (PEM, 선택)</label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">paramOverride (JSON, 선택)</label>
            <textarea
              value={paramOverrideJson}
              onChange={(e) => setParamOverrideJson(e.target.value)}
              rows={3}
              placeholder='{"endpoints": "https://10.0.0.1:2379"}'
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono"
            />
          </div>

          {error && <div className="text-xs text-red-500">{error}</div>}

          {result && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-3">
                <StatusPill status={result.status} />
                <span className="text-[11px] font-mono text-muted-foreground">{result.host}</span>
                {result.exitCode !== null && result.exitCode !== undefined && (
                  <span className="text-[11px] font-mono text-muted-foreground">exit {result.exitCode}</span>
                )}
                <span className="text-[11px] font-mono text-muted-foreground">{result.durationMs}ms</span>
              </div>
              <div className="p-3 space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">command</p>
                  <pre className="text-[11px] font-mono bg-background border border-border rounded p-2 overflow-auto whitespace-pre-wrap">
                    {result.executedCommand || '(none)'}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stdout</p>
                  <LogViewer text={result.stdout} maxHeight="max-h-[300px]" />
                </div>
                {result.stderr && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stderr</p>
                    <LogViewer text={result.stderr} maxHeight="max-h-[200px]" asError />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-xl bg-secondary text-secondary-foreground">
            닫기
          </button>
          <button
            onClick={submit}
            disabled={run.isPending}
            className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            {run.isPending ? '실행 중…' : '실행'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RunsList({ jobId }: { jobId: string }) {
  const runsQ = useBatchJobRuns(jobId);
  const runs = runsQ.data ?? [];
  if (runs.length === 0) {
    return <p className="text-[11px] text-muted-foreground py-2">아직 실행 이력이 없습니다.</p>;
  }
  return (
    <ul className="space-y-1">
      {runs.slice(0, 5).map((r) => (
        <li key={r.id} className="flex items-center gap-2 text-[11px]">
          <StatusPill status={r.status} />
          <span className="font-mono text-muted-foreground">{r.startedAt.replace('T', ' ').slice(0, 19)}</span>
          <span className="text-muted-foreground">{r.durationMs}ms</span>
          {r.host && <span className="font-mono text-muted-foreground">@ {r.host}</span>}
        </li>
      ))}
    </ul>
  );
}

export function BatchJobsPage() {
  const { data: clusters = [] } = useClusters();
  const [clusterId, setClusterId] = useState('');
  useEffect(() => {
    if (!clusterId && clusters.length > 0) setClusterId(clusters[0].id);
  }, [clusters, clusterId]);

  const jobsQ = useBatchJobs(clusterId);
  const del = useDeleteBatchJob();

  const [showCreate, setShowCreate] = useState(false);
  const [runJob, setRunJob] = useState<BatchJob | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BatchJob | null>(null);

  return (
    <main className="max-w-[1400px] mx-auto p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListTree className="w-5 h-5" /> Batch Jobs
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            클러스터 단위 운영성 잡 (etcdctl defrag, 스냅샷, 로그 정리 등) 등록 · 실행 · 이력.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            className="px-3 py-1.5 text-xs bg-card border border-border rounded-xl"
          >
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!clusterId}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" /> 새 잡
          </button>
        </div>
      </div>

      <MacCard title="등록된 잡 (가로 스크롤 · 개별 로그)">
        {jobsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">로딩 중…</p>
        ) : (jobsQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">등록된 잡이 없습니다. 우측 상단 "새 잡" 버튼으로 추가하세요.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(jobsQ.data ?? []).map((j) => (
              <div key={j.id} className="border border-border rounded-xl p-3 min-w-[420px] max-w-[900px] resize-x overflow-auto">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold whitespace-nowrap">{j.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {j.jobType}
                      </span>
                      <StatusPill status={j.lastStatus} />
                      {j.cron && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                          cron: {j.cron}
                        </span>
                      )}
                      {!j.enabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">disabled</span>
                      )}
                    </div>
                    {j.description && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-words">{j.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      target: {j.defaultUsername}@{j.defaultHost ?? '(per-run)'}:{j.defaultPort}
                      {j.lastRunAt && <> · last run: {j.lastRunAt.replace('T', ' ').slice(0, 19)}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setRunJob(j)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-primary text-primary-foreground"
                    >
                      <Play className="w-3 h-3" /> 실행
                    </button>
                    <button
                      onClick={() => setConfirmDelete(j)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-secondary text-secondary-foreground"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{j.name} 실행 로그</p>
                  <RunsList jobId={j.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </MacCard>

      {showCreate && (
        <CreateJobModal
          open={showCreate}
          clusterId={clusterId}
          onClose={() => setShowCreate(false)}
          onCreated={() => jobsQ.refetch()}
        />
      )}

      {runJob && <RunModal job={runJob} onClose={() => setRunJob(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          title="배치 잡 삭제"
          description={`"${confirmDelete.name}" 잡과 모든 실행 이력을 삭제합니다. 계속할까요?`}
          confirmLabel="삭제"
          danger
          onConfirm={async () => {
            await del.mutateAsync(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </main>
  );
}
