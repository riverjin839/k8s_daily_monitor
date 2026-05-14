import { useEffect, useId, useMemo, useState } from 'react';
import {
  CheckCircle, ChevronDown, Clock, History, Pencil,
  Play, Plus, ShieldAlert, Trash2, Wifi, XCircle, ListTree,
} from 'lucide-react';

import { MacCard } from '@/components/ui/MacCard';
import { ConfirmDialog, LogViewer, MasterHostPicker, DoubleScrollX} from '@/components/common';
import { useClusters } from '@/hooks/useCluster';
import {
  useBatchJobRuns,
  useBatchJobTypes,
  useBatchJobs,
  useCreateBatchJob,
  useDeleteBatchJob,
  useRunBatchJob,
  useUpdateBatchJob,
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

interface JobFormModalProps {
  open: boolean;
  /** Empty string → modal lets the user pick from all clusters. */
  clusterId: string;
  defaultJobType?: string;
  /** When set, the modal switches to edit mode and pre-fills from this job. */
  editingJob?: BatchJob | null;
  onClose: () => void;
  onSaved: () => void;
}

function JobFormModal({ open, clusterId, defaultJobType, editingJob, onClose, onSaved }: JobFormModalProps) {
  const isEdit = !!editingJob;
  const typesQ = useBatchJobTypes();
  const create = useCreateBatchJob();
  const update = useUpdateBatchJob();
  const { data: clusters = [] } = useClusters();

  const [selectedClusterId, setSelectedClusterId] = useState(clusterId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [defaultHost, setDefaultHost] = useState('');
  const [hostSelectedName, setHostSelectedName] = useState('');
  const [hostCustom, setHostCustom] = useState('');
  const [defaultPort, setDefaultPort] = useState(22);
  const [defaultUsername, setDefaultUsername] = useState('root');
  const [cron, setCron] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [savedPassword, setSavedPassword] = useState('');
  const [savedPrivateKey, setSavedPrivateKey] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [clearPrivateKey, setClearPrivateKey] = useState(false);
  const [paramsJson, setParamsJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const fid = useId();
  const f = (k: string) => `${fid}-${k}`;

  const selectedType = useMemo(
    () => typesQ.data?.find((t) => t.jobType === jobType),
    [typesQ.data, jobType],
  );

  // 모달이 열릴 때 폼 상태 초기화 — 편집 모드면 잡 값으로, 신규면 props 기본값으로.
  useEffect(() => {
    if (!open) return;
    if (editingJob) {
      setSelectedClusterId(editingJob.clusterId);
      setName(editingJob.name);
      setDescription(editingJob.description ?? '');
      setJobType(editingJob.jobType);
      setDefaultHost(editingJob.defaultHost ?? '');
      setHostSelectedName('');
      setHostCustom(editingJob.defaultHost ?? '');
      setDefaultPort(editingJob.defaultPort);
      setDefaultUsername(editingJob.defaultUsername);
      setCron(editingJob.cron ?? '');
      setEnabled(editingJob.enabled);
      setParamsJson(JSON.stringify(editingJob.params ?? {}, null, 2));
      setSavedPassword('');
      setSavedPrivateKey('');
      setClearPassword(false);
      setClearPrivateKey(false);
      setError(null);
    } else {
      setSelectedClusterId(clusterId);
      setName('');
      setDescription('');
      setJobType(defaultJobType ?? '');
      setDefaultHost('');
      setHostSelectedName('');
      setHostCustom('');
      setDefaultPort(22);
      setDefaultUsername('root');
      setCron('');
      setEnabled(true);
      setSavedPassword('');
      setSavedPrivateKey('');
      setClearPassword(false);
      setClearPrivateKey(false);
      setError(null);
    }
  }, [open, editingJob, clusterId, defaultJobType]);

  // 신규 모드에서 jobType 이 비어 있으면 첫 번째 타입을 기본값으로.
  useEffect(() => {
    if (!open || isEdit) return;
    if (!jobType && typesQ.data && typesQ.data.length > 0) {
      setJobType(typesQ.data[0].jobType);
    }
  }, [open, isEdit, typesQ.data, jobType]);

  useEffect(() => {
    if (isEdit) return;
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
    if (!name.trim() || !jobType || !selectedClusterId) {
      setError('name, jobType, cluster 는 필수입니다.');
      return;
    }
    if (cron.trim()) {
      const willHaveCreds = isEdit
        ? (
            (!clearPassword && (editingJob?.hasSavedPassword || !!savedPassword)) ||
            (!clearPrivateKey && (editingJob?.hasSavedPrivateKey || !!savedPrivateKey))
          )
        : (!!savedPassword || !!savedPrivateKey);
      if (!willHaveCreds) {
        setError('cron 스케줄을 사용하려면 저장된 자격증명(비밀번호 또는 개인키)이 필요합니다.');
        return;
      }
    }
    try {
      if (isEdit && editingJob) {
        await update.mutateAsync({
          id: editingJob.id,
          data: {
            name: name.trim(),
            description: description.trim(),
            defaultHost: defaultHost.trim(),
            defaultPort,
            defaultUsername: defaultUsername.trim() || 'root',
            cron: cron.trim(),
            enabled,
            params,
            savedPassword: savedPassword || undefined,
            savedPrivateKey: savedPrivateKey || undefined,
            clearSavedPassword: clearPassword || undefined,
            clearSavedPrivateKey: clearPrivateKey || undefined,
          },
        });
      } else {
        await create.mutateAsync({
          clusterId: selectedClusterId,
          name: name.trim(),
          description: description.trim() || undefined,
          jobType,
          defaultHost: defaultHost.trim() || undefined,
          defaultPort,
          defaultUsername: defaultUsername.trim() || 'root',
          cron: cron.trim() || undefined,
          enabled,
          params,
          savedPassword: savedPassword || undefined,
          savedPrivateKey: savedPrivateKey || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">{isEdit ? '배치 잡 수정' : '새 배치 잡 등록'}</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>

        <div className="p-5 space-y-4">
          {!clusterId && !isEdit && (
            <div>
              <label htmlFor={f('cluster')} className="block text-xs text-muted-foreground mb-1">클러스터</label>
              <select
                id={f('cluster')}
                value={selectedClusterId}
                onChange={(e) => setSelectedClusterId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              >
                <option value="">선택하세요…</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.region ? ` (${c.region})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor={f('jobType')} className="block text-xs text-muted-foreground mb-1">
              Job Type {isEdit && <span className="text-muted-foreground/60">(수정 불가)</span>}
            </label>
            <select
              id={f('jobType')}
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              disabled={isEdit}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">선택하세요…</option>
              {(typesQ.data ?? []).map((t) => (
                <option key={t.jobType} value={t.jobType}>
                  {t.label} ({t.jobType})
                </option>
              ))}
              {isEdit && jobType && !typesQ.data?.some((t) => t.jobType === jobType) && (
                <option value={jobType}>{jobType}</option>
              )}
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
                clusterId={selectedClusterId}
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

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id={f('enabled')}
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <label htmlFor={f('enabled')} className="text-xs text-foreground select-none">
                활성 <span className="text-muted-foreground">— 비활성 시 cron 스케줄러가 건너뜁니다.</span>
              </label>
            </div>
          )}

          <details className="border border-border rounded-xl px-3 py-2" open={!!cron.trim()}>
            <summary className="text-xs font-medium cursor-pointer">
              저장된 자격증명 <span className="text-muted-foreground">(스케줄 실행 전용 — 선택)</span>
              {isEdit && (
                <span className="ml-2 text-[10px]">
                  {editingJob?.hasSavedPassword && (
                    <span className="text-emerald-600 mr-1.5">● 비밀번호 저장됨</span>
                  )}
                  {editingJob?.hasSavedPrivateKey && (
                    <span className="text-emerald-600">● 개인키 저장됨</span>
                  )}
                  {!editingJob?.hasSavedPassword && !editingJob?.hasSavedPrivateKey && (
                    <span className="text-muted-foreground">(저장된 자격증명 없음)</span>
                  )}
                </span>
              )}
            </summary>
            <p className="mt-2 text-[11px] text-muted-foreground">
              cron 으로 자동 실행할 때 SSH 인증에 사용됩니다. 수동 실행에서는 실행 모달에서 별도 입력하면 되므로 비워두어도 무방합니다.
              값은 서버의 <code className="font-mono">SECRET_KEY</code> 로 암호화되어 저장됩니다.
              {isEdit && ' 비워두면 기존 값을 유지합니다.'}
            </p>
            <div className="mt-2 space-y-2">
              <div>
                <label htmlFor={f('savedPw')} className="block text-xs text-muted-foreground mb-1">
                  저장 비밀번호
                  {isEdit && editingJob?.hasSavedPassword && (
                    <label className="ml-2 inline-flex items-center gap-1 text-[10px] text-red-500">
                      <input
                        type="checkbox"
                        checked={clearPassword}
                        onChange={(e) => setClearPassword(e.target.checked)}
                        className="w-3 h-3"
                      />
                      저장된 비밀번호 삭제
                    </label>
                  )}
                </label>
                <input
                  id={f('savedPw')}
                  type="password"
                  value={savedPassword}
                  onChange={(e) => setSavedPassword(e.target.value)}
                  disabled={clearPassword}
                  placeholder={isEdit && editingJob?.hasSavedPassword ? '비워두면 기존 값 유지' : ''}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl disabled:opacity-50"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor={f('savedPem')} className="block text-xs text-muted-foreground mb-1">
                  저장 개인키 (PEM)
                  {isEdit && editingJob?.hasSavedPrivateKey && (
                    <label className="ml-2 inline-flex items-center gap-1 text-[10px] text-red-500">
                      <input
                        type="checkbox"
                        checked={clearPrivateKey}
                        onChange={(e) => setClearPrivateKey(e.target.checked)}
                        className="w-3 h-3"
                      />
                      저장된 개인키 삭제
                    </label>
                  )}
                </label>
                <textarea
                  id={f('savedPem')}
                  value={savedPrivateKey}
                  onChange={(e) => setSavedPrivateKey(e.target.value)}
                  disabled={clearPrivateKey}
                  rows={3}
                  placeholder={isEdit && editingJob?.hasSavedPrivateKey ? '비워두면 기존 값 유지' : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono disabled:opacity-50"
                />
              </div>
            </div>
          </details>

          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-xl bg-secondary text-secondary-foreground">
            취소
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            {pending ? (isEdit ? '저장 중…' : '등록 중…') : (isEdit ? '저장' : '등록')}
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

// ── 단일 잡 아래에 인라인으로 접히는 실행 이력 ─────────────────────────────
interface InlineRunHistoryProps {
  jobId: string;
  onSelectRun: (run: BatchJobRun) => void;
}

function InlineRunHistory({ jobId, onSelectRun }: InlineRunHistoryProps) {
  const runsQ = useBatchJobRuns(jobId);
  const runs = runsQ.data ?? [];
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? runs.slice(0, 30) : runs.slice(0, 6);

  return (
    <div className="mt-1.5 rounded-md border border-border/60 bg-muted/20 overflow-hidden">
      <div className="px-2 py-1 border-b border-border/40 bg-muted/30 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">실행 이력</span>
        {runs.length > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{runs.length}건</span>
        )}
      </div>
      {runsQ.isLoading ? (
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">로딩 중…</p>
      ) : runs.length === 0 ? (
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground italic">
          아직 실행 이력이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {visible.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.unknown;
            const { Icon } = meta;
            const time = r.startedAt.replace('T', ' ').slice(5, 16); // MM-DD HH:mm
            return (
              <li key={r.id}>
                <button
                  onClick={() => onSelectRun(r)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] hover:bg-muted/40 text-left"
                  title={`${r.status} · ${r.trigger} · ${r.durationMs}ms`}
                >
                  <Icon className={`w-3 h-3 flex-shrink-0 ${meta.cls.split(' ').find((c) => c.startsWith('text-')) ?? ''}`} />
                  <span className="font-mono text-foreground/80 whitespace-nowrap">{time}</span>
                  <span className="text-muted-foreground/70 whitespace-nowrap">{r.trigger}</span>
                  <span className="ml-auto font-mono text-muted-foreground tabular-nums">{r.durationMs}ms</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {runs.length > 6 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-2 py-1 text-[10px] text-primary hover:bg-muted/40 border-t border-border/40"
        >
          {showAll ? '간단히 보기' : `더 보기 (+${Math.min(runs.length, 30) - 6})`}
        </button>
      )}
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
  expandedIds: Set<string>;
  onRun: (job: BatchJob) => void;
  onToggleHistory: (job: BatchJob) => void;
  onEdit: (job: BatchJob) => void;
  onDelete: (job: BatchJob) => void;
  onAdd: () => void;
  onSelectRun: (job: BatchJob, run: BatchJobRun) => void;
}

function JobEntry({
  job, expanded, onRun, onToggleHistory, onEdit, onDelete, onSelectRun,
}: {
  job: BatchJob;
  expanded: boolean;
  onRun: () => void;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelectRun: (run: BatchJobRun) => void;
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
        {job.cron && !job.hasSavedPassword && !job.hasSavedPrivateKey && (
          <span
            className="text-amber-600"
            title="cron 이 설정되어 있지만 저장된 자격증명이 없어 스케줄 실행이 불가합니다."
          >
            ⚠ 자격증명 없음
          </span>
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
          onClick={onToggleHistory}
          aria-expanded={expanded}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md hover:bg-secondary/80 ${
            expanded
              ? 'bg-primary/15 text-primary'
              : 'bg-secondary text-secondary-foreground'
          }`}
          title={expanded ? '실행 이력 닫기' : '실행 이력 펼치기'}
        >
          <History className="w-2.5 h-2.5" />
          <ChevronDown className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          title="수정"
        >
          <Pencil className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 ml-auto"
          title="삭제"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
      {expanded && <InlineRunHistory jobId={job.id} onSelectRun={onSelectRun} />}
    </div>
  );
}

function JobCell({ jobs, expandedIds, onRun, onToggleHistory, onEdit, onDelete, onAdd, onSelectRun }: JobCellProps) {
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
            expanded={expandedIds.has(j.id)}
            onRun={() => onRun(j)}
            onToggleHistory={() => onToggleHistory(j)}
            onEdit={() => onEdit(j)}
            onDelete={() => onDelete(j)}
            onSelectRun={(run) => onSelectRun(j, run)}
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
  const [editJob, setEditJob] = useState<BatchJob | null>(null);
  const [runJob, setRunJob] = useState<BatchJob | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<BatchJob | null>(null);
  const [runDetail, setRunDetail] = useState<{ run: BatchJobRun; jobName: string } | null>(null);

  const toggleHistory = (job: BatchJob) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(job.id)) next.delete(job.id);
      else next.add(job.id);
      return next;
    });
  };

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
      <div className="flex items-start justify-between gap-3">
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
        <button
          onClick={() => setCreateCtx({ clusterId: '' })}
          disabled={clusters.length === 0 || types.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          title={clusters.length === 0 ? '먼저 클러스터를 등록하세요' : types.length === 0 ? '사용 가능한 잡 타입이 없습니다' : '새 배치 잡 등록'}
        >
          <Plus className="w-3.5 h-3.5" /> 새 배치 잡
        </button>
      </div>

      <MacCard title="배치 잡 매트릭스" bodyPadding="p-0">
        {allJobsQ.isLoading ? (
          <p className="text-xs text-muted-foreground p-5">로딩 중…</p>
        ) : clusters.length === 0 ? (
          <p className="text-xs text-muted-foreground p-5">등록된 클러스터가 없습니다.</p>
        ) : columns.length === 0 ? (
          <p className="text-xs text-muted-foreground p-5">사용 가능한 잡 타입이 없습니다 — 백엔드 batch-jobs/types 응답을 확인해 주세요.</p>
        ) : (
          <DoubleScrollX>
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
                            expandedIds={expandedIds}
                            onRun={(j) => setRunJob(j)}
                            onToggleHistory={toggleHistory}
                            onEdit={(j) => setEditJob(j)}
                            onDelete={(j) => setConfirmDelete(j)}
                            onAdd={() => setCreateCtx({ clusterId: cluster.id, jobType: col.jobType })}
                            onSelectRun={(j, run) => setRunDetail({ run, jobName: j.name })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </DoubleScrollX>
        )}
      </MacCard>

      {(createCtx || editJob) && (
        <JobFormModal
          open={!!(createCtx || editJob)}
          clusterId={editJob ? editJob.clusterId : (createCtx?.clusterId ?? '')}
          defaultJobType={createCtx?.jobType}
          editingJob={editJob}
          onClose={() => { setCreateCtx(null); setEditJob(null); }}
          onSaved={() => allJobsQ.refetch()}
        />
      )}

      {runJob && <RunModal job={runJob} onClose={() => setRunJob(null)} />}

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
