import { useEffect, useId, useMemo, useState } from 'react';
import {
  CheckCircle, Clock, Eye, History,
  Play, Plus, ShieldAlert, Trash2, Wifi, XCircle, ListTree,
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
  defaultJobType?: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateJobModal({ open, clusterId, defaultJobType, onClose, onCreated }: CreateJobModalProps) {
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

  const fid = useId();
  const f = (k: string) => `${fid}-${k}`;

  const selectedType = useMemo(
    () => typesQ.data?.find((t) => t.jobType === jobType),
    [typesQ.data, jobType],
  );

  // 모달이 열릴 때마다 defaultJobType 우선, 없으면 첫 번째 타입을 기본값으로.
  useEffect(() => {
    if (!open) return;
    if (defaultJobType) {
      setJobType(defaultJobType);
    } else if (!jobType && typesQ.data && typesQ.data.length > 0) {
      setJobType(typesQ.data[0].jobType);
    }
  }, [open, defaultJobType, typesQ.data, jobType]);

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
            <label htmlFor={f('jobType')} className="block text-xs text-muted-foreground mb-1">Job Type</label>
            <select
              id={f('jobType')}
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
              <label htmlFor={f('name')} className="block text-xs text-muted-foreground mb-1">이름</label>
              <input
                id={f('name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
            <div>
              <label htmlFor={f('cron')} className="block text-xs text-muted-foreground mb-1">cron (선택)</label>
              <input
                id={f('cron')}
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="0 3 * * *"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor={f('desc')} className="block text-xs text-muted-foreground mb-1">설명</label>
            <input
              id={f('desc')}
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
              <label htmlFor={f('port')} className="block text-xs text-muted-foreground mb-1">포트</label>
              <input
                id={f('port')}
                type="number"
                value={defaultPort}
                onChange={(e) => setDefaultPort(Number(e.target.value) || 22)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label htmlFor={f('user')} className="block text-xs text-muted-foreground mb-1">기본 사용자</label>
            <input
              id={f('user')}
              value={defaultUsername}
              onChange={(e) => setDefaultUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
            />
          </div>

          <div>
            <label htmlFor={f('params')} className="block text-xs text-muted-foreground mb-1">params (JSON)</label>
            <textarea
              id={f('params')}
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

  const fid = useId();
  const f = (k: string) => `${fid}-${k}`;

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
              <label htmlFor={f('port')} className="block text-xs text-muted-foreground mb-1">포트</label>
              <input
                id={f('port')}
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 22)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={f('user')} className="block text-xs text-muted-foreground mb-1">사용자</label>
              <input
                id={f('user')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
              />
            </div>
            <div>
              <label htmlFor={f('timeout')} className="block text-xs text-muted-foreground mb-1">타임아웃 (초)</label>
              <input
                id={f('timeout')}
                type="number"
                value={timeout}
                onChange={(e) => setTimeoutSec(Number(e.target.value) || 60)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
          </div>

          <div>
            <label htmlFor={f('pw')} className="block text-xs text-muted-foreground mb-1">비밀번호 (또는 개인키)</label>
            <input
              id={f('pw')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>
          <div>
            <label htmlFor={f('pem')} className="block text-xs text-muted-foreground mb-1">개인키 (PEM, 선택)</label>
            <textarea
              id={f('pem')}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </div>

          <div>
            <label htmlFor={f('override')} className="block text-xs text-muted-foreground mb-1">paramOverride (JSON, 선택)</label>
            <textarea
              id={f('override')}
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

// ── 단일 잡의 최근 실행 이력 모달 ──────────────────────────────────────────
interface JobRunsModalProps {
  job: BatchJob;
  onSelectRun: (run: BatchJobRun) => void;
  onClose: () => void;
}

function JobRunsModal({ job, onSelectRun, onClose }: JobRunsModalProps) {
  const runsQ = useBatchJobRuns(job.id);
  const runs = runsQ.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{job.name} — 실행 이력</h3>
            <p className="text-[11px] text-muted-foreground font-mono">{job.jobType}</p>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>
        <div className="p-3">
          {runsQ.isLoading ? (
            <p className="text-xs text-muted-foreground p-3">로딩 중…</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">아직 실행 이력이 없습니다.</p>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border bg-muted/20">
                      <th className="px-3 py-1.5 font-medium w-24">상태</th>
                      <th className="px-3 py-1.5 font-medium">실행 시각</th>
                      <th className="px-3 py-1.5 font-medium w-24">소요</th>
                      <th className="px-3 py-1.5 font-medium w-20">트리거</th>
                      <th className="px-3 py-1.5 font-medium">호스트</th>
                      <th className="px-3 py-1.5 font-medium w-16 text-right">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.slice(0, 20).map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/60 last:border-b-0 hover:bg-muted/10 cursor-pointer"
                        onClick={() => onSelectRun(r)}
                      >
                        <td className="px-3 py-1.5"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                          {r.startedAt.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground tabular-nums">{r.durationMs}ms</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.trigger}</td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[260px]">
                          {r.host || '-'}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="inline-flex items-center gap-1 text-primary hover:underline">
                            <Eye className="w-3 h-3" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 과거 실행 이력 상세 보기 모달 ────────────────────────────────────────────
interface RunDetailModalProps {
  run: BatchJobRun;
  jobName: string;
  onClose: () => void;
}

function RunDetailModal({ run, jobName, onClose }: RunDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{jobName}</h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              {run.startedAt.replace('T', ' ').slice(0, 19)}
            </p>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>
        <div className="p-5">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-3 flex-wrap">
              <StatusPill status={run.status} />
              {run.host && <span className="text-[11px] font-mono text-muted-foreground">{run.host}</span>}
              {run.exitCode !== null && run.exitCode !== undefined && (
                <span className="text-[11px] font-mono text-muted-foreground">exit {run.exitCode}</span>
              )}
              <span className="text-[11px] font-mono text-muted-foreground">{run.durationMs}ms</span>
              <span className="text-[11px] font-mono text-muted-foreground">trigger: {run.trigger}</span>
            </div>
            <div className="p-3 space-y-2">
              {run.executedCommand && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">command</p>
                  <pre className="text-[11px] font-mono bg-background border border-border rounded p-2 overflow-auto whitespace-pre-wrap">
                    {run.executedCommand}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stdout</p>
                <LogViewer text={run.stdout} maxHeight="max-h-[300px]" />
              </div>
              {run.stderr && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">stderr</p>
                  <LogViewer text={run.stderr} maxHeight="max-h-[200px]" asError />
                </div>
              )}
              {run.error && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">error</p>
                  <pre className="text-[11px] font-mono bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 rounded p-2 overflow-auto whitespace-pre-wrap">
                    {run.error}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 매트릭스 셀 — (클러스터 × jobType) 교차점에 등록된 N개의 잡 + 각 잡의 마지막 실행 표시 ─
interface JobCellProps {
  jobs: BatchJob[];
  onRun: (job: BatchJob) => void;
  onShowRuns: (job: BatchJob) => void;
  onDelete: (job: BatchJob) => void;
  onAdd: () => void;
}

function JobEntry({
  job, onRun, onShowRuns, onDelete,
}: {
  job: BatchJob;
  onRun: () => void;
  onShowRuns: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <StatusPill status={job.lastStatus} />
        <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0" title={job.name}>
          {job.name}
        </span>
        {!job.enabled && (
          <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground flex-shrink-0">off</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono min-w-0">
        {job.lastRunAt ? (
          <span className="truncate">{job.lastRunAt.replace('T', ' ').slice(5, 16)}</span>
        ) : (
          <span className="opacity-60">미실행</span>
        )}
        {job.cron && (
          <span className="truncate" title={`cron: ${job.cron}`}>⏱ {job.cron}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onRun}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          title="실행"
        >
          <Play className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={onShowRuns}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
          title="실행 이력"
        >
          <History className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 ml-auto"
          title="삭제"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

function JobCell({ jobs, onRun, onShowRuns, onDelete, onAdd }: JobCellProps) {
  if (jobs.length === 0) {
    return (
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md border border-dashed border-border hover:border-primary/40 w-full justify-center"
      >
        <Plus className="w-3 h-3" /> 등록
      </button>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border/60">
      {jobs.map((j, idx) => (
        <div key={j.id} className={idx === 0 ? 'pb-1.5' : 'py-1.5'}>
          <JobEntry
            job={j}
            onRun={() => onRun(j)}
            onShowRuns={() => onShowRuns(j)}
            onDelete={() => onDelete(j)}
          />
        </div>
      ))}
      <button
        onClick={onAdd}
        className="inline-flex items-center justify-center gap-1 mt-1.5 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md border border-dashed border-border hover:border-primary/40"
        title="이 셀에 잡 추가"
      >
        <Plus className="w-2.5 h-2.5" /> 추가
      </button>
    </div>
  );
}

export function BatchJobsPage() {
  const { data: clusters = [] } = useClusters();
  const allJobsQ = useBatchJobs();           // 인자 없으면 전체 클러스터의 잡을 모두 받음
  const typesQ = useBatchJobTypes();
  const del = useDeleteBatchJob();

  const [createCtx, setCreateCtx] = useState<{ clusterId: string; jobType?: string } | null>(null);
  const [runJob, setRunJob] = useState<BatchJob | null>(null);
  const [runsJob, setRunsJob] = useState<BatchJob | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BatchJob | null>(null);
  const [runDetail, setRunDetail] = useState<{ run: BatchJobRun; jobName: string } | null>(null);

  const jobs = useMemo(() => allJobsQ.data ?? [], [allJobsQ.data]);
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);

  // 매트릭스: matrix[clusterId][jobType] = BatchJob[]
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, BatchJob[]>> = {};
    for (const j of jobs) {
      if (!m[j.clusterId]) m[j.clusterId] = {};
      if (!m[j.clusterId][j.jobType]) m[j.clusterId][j.jobType] = [];
      m[j.clusterId][j.jobType].push(j);
    }
    return m;
  }, [jobs]);

  // 화면에 표시할 jobType 컬럼 — 등록된 타입(useBatchJobTypes) 우선, 정의에 없는 커스텀
  // jobType 도 누락 없이 보이도록 실제 데이터의 jobType set 과 합집합.
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const cols: { jobType: string; label: string }[] = [];
    for (const t of types) {
      if (!seen.has(t.jobType)) { seen.add(t.jobType); cols.push({ jobType: t.jobType, label: t.label }); }
    }
    for (const j of jobs) {
      if (!seen.has(j.jobType)) { seen.add(j.jobType); cols.push({ jobType: j.jobType, label: j.jobType }); }
    }
    return cols;
  }, [types, jobs]);

  return (
    <main className="mx-auto p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListTree className="w-5 h-5" /> Batch Jobs
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            행 = 클러스터, 열 = 잡 종류. 한 셀에 1, 2, 3 … N 개의 잡을 등록할 수 있고, 각 잡의 마지막 실행 결과가 함께 표시됩니다.
            <span className="inline-flex items-center gap-1 ml-1">
              <History className="w-3 h-3" /> 버튼으로 실행 이력을 볼 수 있습니다.
            </span>
          </p>
        </div>
      </div>

      <MacCard title="배치 잡 매트릭스" bodyPadding="p-0">
        {allJobsQ.isLoading ? (
          <p className="text-xs text-muted-foreground p-5">로딩 중…</p>
        ) : clusters.length === 0 ? (
          <p className="text-xs text-muted-foreground p-5">등록된 클러스터가 없습니다.</p>
        ) : columns.length === 0 ? (
          <p className="text-xs text-muted-foreground p-5">사용 가능한 잡 타입이 없습니다 — 백엔드 batch-jobs/types 응답을 확인해 주세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
              <colgroup>
                <col style={{ width: 200 }} />
                {columns.map((c) => <col key={c.jobType} style={{ width: 220 }} />)}
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="sticky left-0 z-10 bg-secondary/40 px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">
                    클러스터
                  </th>
                  {columns.map((c) => (
                    <th key={c.jobType}
                      title={`Job 타입: ${c.jobType}`}
                      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0">
                      <div className="truncate" title={c.label}>{c.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground/60 truncate">{c.jobType}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clusters.map((cluster) => (
                  <tr key={cluster.id} className="border-b border-border hover:bg-muted/10 last:border-b-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-3 align-top border-r border-border">
                      <div className="text-sm font-semibold truncate" title={cluster.name}>{cluster.name}</div>
                      {cluster.region && (
                        <div className="text-[10px] text-muted-foreground">{cluster.region}</div>
                      )}
                    </td>
                    {columns.map((col) => {
                      const cellJobs = matrix[cluster.id]?.[col.jobType] ?? [];
                      return (
                        <td key={col.jobType}
                          className="px-3 py-2 align-top border-r border-border last:border-r-0">
                          <JobCell
                            jobs={cellJobs}
                            onRun={(j) => setRunJob(j)}
                            onShowRuns={(j) => setRunsJob(j)}
                            onDelete={(j) => setConfirmDelete(j)}
                            onAdd={() => setCreateCtx({ clusterId: cluster.id, jobType: col.jobType })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MacCard>

      {createCtx && (
        <CreateJobModal
          open={!!createCtx}
          clusterId={createCtx.clusterId}
          defaultJobType={createCtx.jobType}
          onClose={() => setCreateCtx(null)}
          onCreated={() => allJobsQ.refetch()}
        />
      )}

      {runJob && <RunModal job={runJob} onClose={() => setRunJob(null)} />}

      {runsJob && (
        <JobRunsModal
          job={runsJob}
          onSelectRun={(run) => {
            setRunDetail({ run, jobName: runsJob.name });
            setRunsJob(null);
          }}
          onClose={() => setRunsJob(null)}
        />
      )}

      {runDetail && (
        <RunDetailModal
          run={runDetail.run}
          jobName={runDetail.jobName}
          onClose={() => setRunDetail(null)}
        />
      )}

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
