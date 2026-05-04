import { useMemo, useState } from 'react';
import { CheckCircle, Clock, Play, Plus, ShieldAlert, Trash2, Wifi, XCircle, ListTree } from 'lucide-react';
import { MacCard } from '@/components/ui/MacCard';
import { ConfirmDialog, LogViewer, MasterHostPicker } from '@/components/common';
import { useClusters } from '@/hooks/useCluster';
import { useBatchJobRuns, useBatchJobTypes, useBatchJobs, useCreateBatchJob, useDeleteBatchJob, useRunBatchJob } from '@/hooks/useBatchJobs';
import type { BatchJob, BatchJobRun } from '@/services/api';
import { formatApiError } from '@/lib/utils';

const STATUS_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ok: { label: '정상', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', Icon: CheckCircle },
  error: { label: '에러', cls: 'bg-red-500/10 text-red-600 border-red-500/30', Icon: XCircle },
  timeout: { label: '타임아웃', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', Icon: Clock },
  auth_error: { label: '인증 실패', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/30', Icon: ShieldAlert },
  connect_error: { label: '연결 실패', cls: 'bg-slate-500/10 text-slate-600 border-slate-500/30', Icon: Wifi },
  running: { label: '실행 중', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30', Icon: Play },
  unknown: { label: '미실행', cls: 'bg-muted text-muted-foreground border-border', Icon: Clock },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.unknown;
  const { Icon } = meta;
  return <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${meta.cls}`}><Icon className="w-3 h-3" />{meta.label}</span>;
}

interface CreateJobModalProps { open: boolean; clusterId: string; defaultJobType?: string; onClose: () => void; onCreated: () => void; }
function CreateJobModal({ open, clusterId, defaultJobType, onClose, onCreated }: CreateJobModalProps) {
  const typesQ = useBatchJobTypes();
  const create = useCreateBatchJob();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [jobType, setJobType] = useState('');
  const [defaultHost, setDefaultHost] = useState('');
  const [hostSelectedName, setHostSelectedName] = useState('');
  const [hostCustom, setHostCustom] = useState('');
  const [defaultPort] = useState(22);
  const [defaultUsername] = useState('root');
  const [cron] = useState('');
  const [paramsJson, setParamsJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const selectedType = useMemo(() => typesQ.data?.find((t) => t.jobType === jobType), [typesQ.data, jobType]);
  useEffect(() => {
    if (!open) return;
    if (defaultJobType) setJobType(defaultJobType);
    else if (!jobType && typesQ.data?.length) setJobType(typesQ.data[0].jobType);
  }, [open, defaultJobType, typesQ.data, jobType]);

  useEffect(() => {
    if (!selectedType) return;
    setParamsJson(JSON.stringify(selectedType.defaultParams ?? {}, null, 2));
    if (!name) setName(selectedType.label);
    if (!description) setDescription(selectedType.description);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType?.jobType]);

  if (!open) return null;
  const submit = async () => {
    setError(null);
    let params: Record<string, unknown> = {};
    try { params = paramsJson.trim() ? JSON.parse(paramsJson) : {}; } catch { setError('params JSON 파싱 실패'); return; }
    if (!name.trim() || !jobType || !clusterId) { setError('name, jobType, cluster 는 필수'); return; }
    try {
      await create.mutateAsync({ clusterId, name: name.trim(), description: description.trim() || undefined, jobType, defaultHost: defaultHost.trim() || undefined, defaultPort, defaultUsername: defaultUsername.trim() || 'root', cron: cron.trim() || undefined, params });
      onCreated(); onClose();
    } catch (e) { setError(formatApiError(e)); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}><header className="px-5 py-3 border-b border-border flex items-center justify-between"><h3 className="text-sm font-semibold">새 배치 잡 등록</h3><button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button></header><div className="p-5 space-y-4"><select value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"><option value="">선택</option>{(typesQ.data ?? []).map((t) => <option key={t.jobType} value={t.jobType}>{t.label} ({t.jobType})</option>)}</select><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl" placeholder="이름" /><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl" placeholder="설명" /><MasterHostPicker clusterId={clusterId} customHost={hostCustom} selectedName={hostSelectedName} label="기본 호스트" onChange={({ selectedName, customHost, effectiveHost }) => { setHostSelectedName(selectedName); setHostCustom(customHost); setDefaultHost(effectiveHost); }} /><textarea value={paramsJson} onChange={(e) => setParamsJson(e.target.value)} rows={5} className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono" />{error && <div className="text-xs text-red-500">{error}</div>}</div><footer className="px-5 py-3 border-t border-border flex justify-end gap-2"><button onClick={onClose} className="px-3 py-1.5 text-xs rounded-xl bg-secondary">취소</button><button onClick={submit} disabled={create.isPending} className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground">{create.isPending ? '등록 중…' : '등록'}</button></footer></div></div>;
}

function RunModal({ job, onClose }: { job: BatchJob; onClose: () => void }) {
  const run = useRunBatchJob();
  const [host, setHost] = useState(job.defaultHost ?? '');
  const [hostSelectedName, setHostSelectedName] = useState('');
  const [hostCustom, setHostCustom] = useState(job.defaultHost ?? '');
  const [port] = useState(job.defaultPort);
  const [username] = useState(job.defaultUsername);
  const [password, setPassword] = useState('');
  const [privateKey] = useState('');
  const [paramOverrideJson] = useState('');
  const [timeout] = useState(120);
  const [result, setResult] = useState<BatchJobRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null); setResult(null);
    if (!host.trim()) return setError('호스트를 입력해주세요.');
    if (!password && !privateKey) return setError('비밀번호 또는 개인키 중 하나는 필수입니다.');
    let paramOverride: Record<string, unknown> | undefined;
    if (paramOverrideJson.trim()) { try { paramOverride = JSON.parse(paramOverrideJson); } catch { return setError('paramOverride JSON 파싱 실패'); } }
    try { const { data } = await run.mutateAsync({ id: job.id, payload: { host: host.trim(), port, username: username.trim() || 'root', password: password || undefined, privateKey: privateKey || undefined, paramOverride, timeout } }); setResult(data); }
    catch (e) { setError(formatApiError(e)); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}><div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}><header className="px-5 py-3 border-b border-border flex items-center justify-between"><div><h3 className="text-sm font-semibold">{job.name} 실행</h3><p className="text-[11px] text-muted-foreground font-mono">{job.jobType}</p></div><button onClick={onClose} className="text-xs text-muted-foreground">닫기</button></header><div className="p-5 space-y-4"><MasterHostPicker clusterId={job.clusterId} customHost={hostCustom} selectedName={hostSelectedName} label="호스트" onChange={({ selectedName, customHost, effectiveHost }) => { setHostSelectedName(selectedName); setHostCustom(customHost); setHost(effectiveHost); }} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl" placeholder="비밀번호" />{error && <div className="text-xs text-red-500">{error}</div>}{result && <div className="border border-border rounded-xl overflow-hidden"><div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-3"><StatusPill status={result.status} /><span className="text-[11px] font-mono text-muted-foreground">{result.host}</span></div><div className="p-3"><LogViewer text={result.stdout} maxHeight="max-h-[300px]" /></div></div>}</div><footer className="px-5 py-3 border-t border-border flex justify-end gap-2"><button onClick={onClose} className="px-3 py-1.5 text-xs rounded-xl bg-secondary">닫기</button><button onClick={submit} disabled={run.isPending} className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground">{run.isPending ? '실행 중…' : '실행'}</button></footer></div></div>;
}

function RunsList({ jobId }: { jobId: string }) {
  const runs = useBatchJobRuns(jobId).data ?? [];
  if (runs.length === 0) return <p className="text-[11px] text-muted-foreground py-2">아직 실행 이력이 없습니다.</p>;
  return <ul className="space-y-1">{runs.slice(0, 5).map((r) => <li key={r.id} className="flex items-center gap-2 text-[11px]"><StatusPill status={r.status} /><span className="font-mono text-muted-foreground">{r.startedAt.replace('T', ' ').slice(0, 19)}</span></li>)}</ul>;
}

function JobCell({ job, extraCount, onRun, onDelete }: { job: BatchJob; extraCount: number; onRun: () => void; onDelete: () => void; }) {
  return <div className="flex flex-col gap-1.5"><div className="flex items-center gap-1.5 flex-wrap"><StatusPill status={job.lastStatus} />{!job.enabled && <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">disabled</span>}</div><div className="text-[11px] font-medium text-foreground truncate" title={job.name}>{job.name}</div>{job.lastRunAt && <div className="text-[10px] text-muted-foreground font-mono">{job.lastRunAt.replace('T', ' ').slice(0, 16)}</div>}<div className="flex items-center gap-1 mt-0.5"><button onClick={onRun} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-primary text-primary-foreground"><Play className="w-2.5 h-2.5" /> 실행</button><button onClick={onDelete} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>{extraCount > 0 && <span className="text-[10px] text-muted-foreground/70 ml-auto">+{extraCount}</span>}</div></div>;
}

export function BatchJobsPage() {
  const { data: clusters = [] } = useClusters();
  const allJobsQ = useBatchJobs();
  const typesQ = useBatchJobTypes();
  const del = useDeleteBatchJob();
  const [createCtx, setCreateCtx] = useState<{ clusterId: string; jobType?: string } | null>(null);
  const [runJob, setRunJob] = useState<BatchJob | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BatchJob | null>(null);

  const jobs = useMemo(() => allJobsQ.data ?? [], [allJobsQ.data]);
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, BatchJob[]>> = {};
    for (const j of jobs) {
      if (!m[j.clusterId]) m[j.clusterId] = {};
      if (!m[j.clusterId][j.jobType]) m[j.clusterId][j.jobType] = [];
      m[j.clusterId][j.jobType].push(j);
    }
    return m;
  }, [jobs]);
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const cols: { jobType: string; label: string }[] = [];
    for (const t of types) if (!seen.has(t.jobType)) { seen.add(t.jobType); cols.push({ jobType: t.jobType, label: t.label }); }
    for (const j of jobs) if (!seen.has(j.jobType)) { seen.add(j.jobType); cols.push({ jobType: j.jobType, label: j.jobType }); }
    return cols;
  }, [types, jobs]);

  return (
    <main className="max-w-[1800px] mx-auto p-5 space-y-4">
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold flex items-center gap-2"><ListTree className="w-5 h-5" /> Batch Jobs</h1><p className="text-xs text-muted-foreground mt-1">행 = 클러스터, 열 = 잡 종류. 셀 = 등록된 잡과 마지막 실행 결과.</p></div></div>
      <MacCard title="배치 잡 매트릭스" bodyPadding="p-0">
        {allJobsQ.isLoading ? <p className="text-xs text-muted-foreground p-5">로딩 중…</p> : clusters.length === 0 ? <p className="text-xs text-muted-foreground p-5">등록된 클러스터가 없습니다.</p> : columns.length === 0 ? <p className="text-xs text-muted-foreground p-5">사용 가능한 잡 타입이 없습니다 — backend batch-jobs/types 확인.</p> : (
          <div className="overflow-x-auto"><table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}><colgroup><col style={{ width: 200 }} />{columns.map((c) => <col key={c.jobType} style={{ width: 220 }} />)}</colgroup><thead><tr className="border-b border-border bg-secondary/40"><th className="sticky left-0 z-10 bg-secondary/40 px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border">클러스터</th>{columns.map((c) => <th key={c.jobType} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0"><div className="truncate" title={c.label}>{c.label}</div><div className="text-[10px] font-mono text-muted-foreground/60 truncate">{c.jobType}</div></th>)}</tr></thead><tbody>{clusters.map((cluster) => <tr key={cluster.id} className="border-b border-border hover:bg-muted/10 last:border-b-0"><td className="sticky left-0 z-10 bg-card px-3 py-3 align-top border-r border-border"><div className="text-sm font-semibold truncate" title={cluster.name}>{cluster.name}</div>{cluster.region && <div className="text-[10px] text-muted-foreground">{cluster.region}</div>}</td>{columns.map((col) => { const cellJobs = matrix[cluster.id]?.[col.jobType] ?? []; const j = cellJobs[0]; return <td key={col.jobType} className="px-3 py-3 align-top border-r border-border last:border-r-0">{j ? <JobCell job={j} extraCount={cellJobs.length - 1} onRun={() => setRunJob(j)} onDelete={() => setConfirmDelete(j)} /> : <button onClick={() => setCreateCtx({ clusterId: cluster.id, jobType: col.jobType })} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md border border-dashed border-border hover:border-primary/40 w-full justify-center"><Plus className="w-3 h-3" /> 등록</button>}</td>; })}</tr>)}</tbody></table></div>
        )}
      </MacCard>
      {runJob === null && <details className="bg-card border border-border rounded-xl"><summary className="px-4 py-2.5 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">등록된 모든 잡의 최근 실행 이력 보기</summary><div className="p-4 space-y-3">{jobs.length === 0 ? <p className="text-xs text-muted-foreground">등록된 잡이 없습니다.</p> : jobs.map((j) => <div key={j.id} className="border border-border rounded-lg p-2.5"><div className="flex items-center gap-2 mb-1.5 flex-wrap"><span className="text-xs font-semibold">{clusters.find((c) => c.id === j.clusterId)?.name ?? j.clusterId.slice(0, 8)}</span><span className="text-muted-foreground/60 text-xs">·</span><span className="text-xs font-medium">{j.name}</span><span className="text-[10px] font-mono text-muted-foreground">{j.jobType}</span></div><RunsList jobId={j.id} /></div>)}</div></details>}
      {createCtx && <CreateJobModal open={!!createCtx} clusterId={createCtx.clusterId} defaultJobType={createCtx.jobType} onClose={() => setCreateCtx(null)} onCreated={() => allJobsQ.refetch()} />}
      {runJob && <RunModal job={runJob} onClose={() => setRunJob(null)} />}
      {confirmDelete && <ConfirmDialog open={!!confirmDelete} title="배치 잡 삭제" description={`"${confirmDelete.name}" 잡과 모든 실행 이력을 삭제합니다. 계속할까요?`} confirmLabel="삭제" danger onConfirm={async () => { await del.mutateAsync(confirmDelete.id); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />}
    </main>
  );
}
