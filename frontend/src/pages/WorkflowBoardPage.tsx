import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitFork, Plus, Trash2, Link2, Unlink, Check, X, ChevronRight,
  Pencil, Zap, Play, GitBranch, Clock, Bell,
  ZoomIn, ZoomOut, Maximize2, LayoutGrid,
} from 'lucide-react';
import { workflowsApi } from '@/services/api';
import type {
  WorkflowStep, WorkflowEdge,
  WorkflowStepType, WorkflowStepStatus,
  WorkflowStepUpdate, WorkflowUpdate,
} from '@/types';

// ─── constants ───────────────────────────────────────────────────────────────
const CARD_W = 260;
const CARD_H = 160;
const CANVAS_W = 3200;
const CANVAS_H = 2000;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2.0;

// ─── step type config ─────────────────────────────────────────────────────────
type StepTypeCfg = { label: string; border: string; header: string; dot: string; icon: React.ReactNode };
const STEP_TYPE: Record<WorkflowStepType, StepTypeCfg> = {
  trigger:      { label: 'Trigger',      border: 'border-violet-500/60', header: 'bg-violet-500/10',  dot: 'bg-violet-400',  icon: <Zap       className="w-3.5 h-3.5" /> },
  action:       { label: 'Action',       border: 'border-blue-500/60',   header: 'bg-blue-500/10',    dot: 'bg-blue-400',    icon: <Play      className="w-3.5 h-3.5" /> },
  condition:    { label: 'Condition',    border: 'border-amber-500/60',  header: 'bg-amber-500/10',   dot: 'bg-amber-400',   icon: <GitBranch className="w-3.5 h-3.5" /> },
  wait:         { label: 'Wait',         border: 'border-cyan-500/60',   header: 'bg-cyan-500/10',    dot: 'bg-cyan-400',    icon: <Clock     className="w-3.5 h-3.5" /> },
  notification: { label: 'Notification', border: 'border-emerald-500/60',header: 'bg-emerald-500/10', dot: 'bg-emerald-400', icon: <Bell      className="w-3.5 h-3.5" /> },
};
const STEP_TYPE_KEYS = Object.keys(STEP_TYPE) as WorkflowStepType[];

// ─── step status config ───────────────────────────────────────────────────────
type StepStatusCfg = { label: string; cls: string; pulse?: boolean };
const STEP_STATUS: Record<WorkflowStepStatus, StepStatusCfg> = {
  idle:    { label: '대기',   cls: 'bg-zinc-500/20 text-zinc-400' },
  running: { label: '실행 중', cls: 'bg-blue-500/20 text-blue-400', pulse: true },
  success: { label: '성공',   cls: 'bg-emerald-500/20 text-emerald-400' },
  failed:  { label: '실패',   cls: 'bg-red-500/20 text-red-400' },
  skipped: { label: '건너뜀', cls: 'bg-zinc-500/20 text-zinc-400 opacity-50' },
};
const STEP_STATUS_KEYS = Object.keys(STEP_STATUS) as WorkflowStepStatus[];

// ─── helpers ──────────────────────────────────────────────────────────────────
function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const cx1 = sx + Math.abs(dx) * 0.6;
  const cy1 = sy;
  const cx2 = tx - Math.abs(dx) * 0.6;
  const cy2 = ty;
  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
}

function computeAutoLayout(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): Record<string, { x: number; y: number }> {
  const adj: Record<string, string[]> = {};
  const inDeg: Record<string, number> = {};
  steps.forEach((s) => { adj[s.id] = []; inDeg[s.id] = 0; });
  edges.forEach((e) => {
    adj[e.sourceStepId]?.push(e.targetStepId);
    if (e.targetStepId in inDeg) inDeg[e.targetStepId]++;
  });
  const queue = steps.map((s) => s.id).filter((id) => inDeg[id] === 0);
  const depth: Record<string, number> = {};
  queue.forEach((id) => { depth[id] = 0; });
  const visited = new Set(queue);
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const next of adj[cur]) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
      depth[next] = Math.max(depth[next] ?? 0, (depth[cur] ?? 0) + 1);
    }
  }
  const byDepth: Record<number, string[]> = {};
  steps.forEach((s) => {
    const d = depth[s.id] ?? 0;
    (byDepth[d] = byDepth[d] ?? []).push(s.id);
  });
  const GAP_X = CARD_W + 90;
  const GAP_Y = CARD_H + 60;
  const out: Record<string, { x: number; y: number }> = {};
  Object.entries(byDepth).forEach(([colStr, ids]) => {
    const col = Number(colStr);
    ids.forEach((id, row) => { out[id] = { x: 80 + col * GAP_X, y: 80 + row * GAP_Y }; });
  });
  return out;
}

// ─── component ────────────────────────────────────────────────────────────────
export function WorkflowBoardPage() {
  // selection / mode
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // drag
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<{
    stepId: string; startX: number; startY: number; origX: number; origY: number;
  } | null>(null);

  // workflow name editing
  const [editingWfId, setEditingWfId] = useState<string | null>(null);
  const [wfEditTitle, setWfEditTitle] = useState('');
  const [editingHeaderTitle, setEditingHeaderTitle] = useState(false);
  const [headerTitleDraft, setHeaderTitleDraft] = useState('');

  // workflow create
  const [showCreateWf, setShowCreateWf] = useState(false);
  const [newWfTitle, setNewWfTitle] = useState('');

  // step editing
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [stepTitle, setStepTitle] = useState('');
  const [stepDesc, setStepDesc] = useState('');

  // step type/status dropdowns
  const [typeMenuStep, setTypeMenuStep] = useState<string | null>(null);
  const [statusMenuStep, setStatusMenuStep] = useState<string | null>(null);

  // zoom
  const [zoom, setZoom] = useState(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── data ────────────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.getAll().then((r) => r.data),
    staleTime: 1000 * 10,
  });
  const workflows = data?.data ?? [];
  const selectedWf = workflows.find((w) => w.id === selectedId) ?? null;

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
    [queryClient],
  );

  // ── mutations ────────────────────────────────────────────────────────────────
  const createWorkflow = useMutation({
    mutationFn: (title: string) => workflowsApi.create({ title }),
    onSuccess: (res) => {
      invalidate();
      setSelectedId(res.data.id);
      setShowCreateWf(false);
      setNewWfTitle('');
    },
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: WorkflowUpdate }) => workflowsApi.update(id, d),
    onSuccess: () => { invalidate(); setEditingWfId(null); setEditingHeaderTitle(false); },
  });

  const deleteWorkflow = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: (_, id) => { invalidate(); if (selectedId === id) setSelectedId(null); },
  });

  const addStep = useMutation({
    mutationFn: ({ wfId, count }: { wfId: string; count: number }) =>
      workflowsApi.createStep(wfId, {
        title: `단계 ${count + 1}`,
        posX: 80 + (count % 4) * (CARD_W + 80),
        posY: 80 + Math.floor(count / 4) * (CARD_H + 60),
        orderIndex: count,
      }),
    onSuccess: invalidate,
  });

  const updateStep = useMutation({
    mutationFn: ({ wfId, stepId, stepData }: { wfId: string; stepId: string; stepData: WorkflowStepUpdate }) =>
      workflowsApi.updateStep(wfId, stepId, stepData),
    onSuccess: invalidate,
  });

  const deleteStep = useMutation({
    mutationFn: ({ wfId, stepId }: { wfId: string; stepId: string }) =>
      workflowsApi.deleteStep(wfId, stepId),
    onSuccess: () => { invalidate(); setEditingStep(null); },
  });

  const createEdge = useMutation({
    mutationFn: ({ wfId, sourceStepId, targetStepId }: { wfId: string; sourceStepId: string; targetStepId: string }) =>
      workflowsApi.createEdge(wfId, { sourceStepId, targetStepId }),
    onSuccess: () => { invalidate(); setConnectingFrom(null); },
  });

  const deleteEdge = useMutation({
    mutationFn: ({ wfId, edgeId }: { wfId: string; edgeId: string }) =>
      workflowsApi.deleteEdge(wfId, edgeId),
    onSuccess: invalidate,
  });

  // ── zoom: ctrl+wheel ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((prev) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev - e.deltaY * 0.002)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────────
  const getPos = (step: WorkflowStep) => localPos[step.id] ?? { x: step.posX, y: step.posY };

  const handleAutoLayout = () => {
    if (!selectedWf) return;
    const positions = computeAutoLayout(selectedWf.steps, selectedWf.edges);
    setLocalPos((prev) => ({ ...prev, ...positions }));
    selectedWf.steps.forEach((s) => {
      const p = positions[s.id];
      if (p) updateStep.mutate({ wfId: selectedWf.id, stepId: s.id, stepData: { posX: p.x, posY: p.y } });
    });
  };

  const handleStepPointerDown = (e: React.PointerEvent<HTMLDivElement>, step: WorkflowStep) => {
    if (connectMode) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(step);
    setDragging({ stepId: step.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  };

  const handleStepPointerMove = (e: React.PointerEvent<HTMLDivElement>, step: WorkflowStep) => {
    if (!dragging || dragging.stepId !== step.id) return;
    const dx = (e.clientX - dragging.startX) / zoom;
    const dy = (e.clientY - dragging.startY) / zoom;
    setLocalPos((prev) => ({
      ...prev,
      [step.id]: { x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) },
    }));
  };

  const handleStepPointerUp = (step: WorkflowStep) => {
    if (!dragging || dragging.stepId !== step.id) return;
    const pos = localPos[step.id];
    if (pos && selectedWf) {
      updateStep.mutate({ wfId: selectedWf.id, stepId: step.id, stepData: { posX: pos.x, posY: pos.y } });
    }
    setDragging(null);
  };

  const handleStepClick = (step: WorkflowStep) => {
    if (!connectMode) return;
    if (!connectingFrom) {
      setConnectingFrom(step.id);
    } else if (connectingFrom !== step.id && selectedWf) {
      createEdge.mutate({ wfId: selectedWf.id, sourceStepId: connectingFrom, targetStepId: step.id });
    } else {
      setConnectingFrom(null);
    }
  };

  const startEditStep = (step: WorkflowStep) => {
    setEditingStep(step.id);
    setStepTitle(step.title);
    setStepDesc(step.description ?? '');
  };

  const saveEditStep = () => {
    if (!editingStep || !selectedWf) return;
    updateStep.mutate({
      wfId: selectedWf.id,
      stepId: editingStep,
      stepData: { title: stepTitle.trim() || '단계', description: stepDesc || undefined },
    });
    setEditingStep(null);
  };

  // close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setTypeMenuStep(null); setStatusMenuStep(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* ── Left sidebar ── */}
      <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">워크플로우</span>
          </div>
          <button
            onClick={() => setShowCreateWf(true)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* create workflow form */}
        {showCreateWf && (
          <div className="px-3 py-3 border-b border-border bg-secondary/30">
            <input
              type="text"
              value={newWfTitle}
              onChange={(e) => setNewWfTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newWfTitle.trim()) createWorkflow.mutate(newWfTitle.trim());
                if (e.key === 'Escape') { setShowCreateWf(false); setNewWfTitle(''); }
              }}
              placeholder="워크플로우 이름"
              className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => newWfTitle.trim() && createWorkflow.mutate(newWfTitle.trim())}
                disabled={!newWfTitle.trim()}
                className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
              >
                생성
              </button>
              <button
                onClick={() => { setShowCreateWf(false); setNewWfTitle(''); }}
                className="flex-1 px-2 py-1 text-xs bg-secondary text-foreground rounded hover:bg-secondary/80"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* workflow list */}
        <div className="flex-1 overflow-y-auto py-2">
          {workflows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-10 px-4 leading-relaxed">
              워크플로우가 없습니다.
              <br />
              <button onClick={() => setShowCreateWf(true)} className="mt-2 text-primary hover:underline">
                + 새로 만들기
              </button>
            </p>
          ) : (
            workflows.map((wf) => {
              const doneCount = wf.steps.filter((s) => s.completed).length;
              const total = wf.steps.length;
              const isSelected = selectedId === wf.id;
              const isRenamingThis = editingWfId === wf.id;

              return (
                <div key={wf.id} className={`group relative ${isSelected ? 'bg-primary/10' : 'hover:bg-secondary'}`}>
                  {isRenamingThis ? (
                    <div className="px-3 py-2 flex items-center gap-1.5">
                      <input
                        value={wfEditTitle}
                        onChange={(e) => setWfEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && wfEditTitle.trim())
                            updateWorkflow.mutate({ id: wf.id, data: { title: wfEditTitle.trim() } });
                          if (e.key === 'Escape') setEditingWfId(null);
                        }}
                        className="flex-1 min-w-0 px-2 py-1 text-sm bg-background border border-primary rounded focus:outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={() => wfEditTitle.trim() && updateWorkflow.mutate({ id: wf.id, data: { title: wfEditTitle.trim() } })}
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingWfId(null)}
                        className="p-1 rounded text-muted-foreground hover:bg-secondary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                      onClick={() => { setSelectedId(wf.id); setConnectMode(false); setConnectingFrom(null); }}
                    >
                      <ChevronRight
                        className={`w-3 h-3 flex-shrink-0 transition-transform ${isSelected ? 'rotate-90 text-primary' : 'text-muted-foreground'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>{wf.title}</p>
                        <p className="text-xs text-muted-foreground">{total}단계 · {doneCount}/{total} 완료</p>
                        {total > 0 && (
                          <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${(doneCount / total) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {/* rename + delete buttons */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWfId(wf.id);
                            setWfEditTitle(wf.title);
                          }}
                          className="p-1 rounded hover:bg-blue-500/20 hover:text-blue-400 text-muted-foreground"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`"${wf.title}" 워크플로우를 삭제할까요?`)) deleteWorkflow.mutate(wf.id);
                          }}
                          className="p-1 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Main canvas ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {!selectedWf ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <GitFork className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
              <p className="text-muted-foreground mb-2">왼쪽에서 워크플로우를 선택하거나 새로 만드세요</p>
              <button onClick={() => setShowCreateWf(true)} className="text-sm text-primary hover:underline">
                + 새 워크플로우 만들기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Toolbar ── */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-card flex-shrink-0">
              {/* title (inline edit) */}
              <div className="flex items-center gap-2 min-w-0">
                {editingHeaderTitle ? (
                  <>
                    <input
                      value={headerTitleDraft}
                      onChange={(e) => setHeaderTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && headerTitleDraft.trim())
                          updateWorkflow.mutate({ id: selectedWf.id, data: { title: headerTitleDraft.trim() } });
                        if (e.key === 'Escape') setEditingHeaderTitle(false);
                      }}
                      className="text-base font-semibold bg-background border border-primary rounded px-2 py-0.5 focus:outline-none min-w-0 w-56"
                      autoFocus
                    />
                    <button
                      onClick={() => headerTitleDraft.trim() && updateWorkflow.mutate({ id: selectedWf.id, data: { title: headerTitleDraft.trim() } })}
                      className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingHeaderTitle(false)}
                      className="p-1 rounded text-muted-foreground hover:bg-secondary"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    className="flex items-center gap-1.5 group/title min-w-0"
                    onClick={() => { setHeaderTitleDraft(selectedWf.title); setEditingHeaderTitle(true); }}
                  >
                    <h2 className="text-base font-semibold truncate group-hover/title:text-primary transition-colors">
                      {selectedWf.title}
                    </h2>
                    <Pencil className="w-3 h-3 text-muted-foreground/40 group-hover/title:text-primary transition-colors flex-shrink-0" />
                  </button>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {selectedWf.steps.length}단계 · {selectedWf.steps.filter((s) => s.completed).length} 완료 · {selectedWf.edges.length}개 연결
                </span>
              </div>

              {/* right controls */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* connect mode hint */}
                {connectMode && (
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${
                    connectingFrom
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}>
                    {connectingFrom ? '연결할 다음 단계 클릭' : '시작 단계 클릭'}
                  </span>
                )}

                {/* zoom controls */}
                <div className="flex items-center gap-0.5 border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - 0.1).toFixed(2)))}
                    className="px-2 py-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="px-2 py-1.5 text-xs hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors min-w-[42px]"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + 0.1).toFixed(2)))}
                    className="px-2 py-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="px-2 py-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border-l border-border"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* auto layout */}
                <button
                  onClick={handleAutoLayout}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:bg-secondary text-foreground flex items-center gap-1.5 transition-colors"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  자동 배치
                </button>

                {/* connect mode */}
                <button
                  onClick={() => { setConnectMode((m) => !m); setConnectingFrom(null); }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                    connectMode
                      ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                      : 'bg-background border-border hover:bg-secondary text-foreground'
                  }`}
                >
                  {connectMode ? <Unlink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {connectMode ? '연결 끄기' : '단계 연결'}
                </button>

                {/* add step */}
                <button
                  onClick={() => addStep.mutate({ wfId: selectedWf.id, count: selectedWf.steps.length })}
                  className="px-2.5 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  단계 추가
                </button>
              </div>
            </div>

            {/* ── Canvas scroll container ── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto"
              style={{
                backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
              onClick={() => { setTypeMenuStep(null); setStatusMenuStep(null); }}
            >
              {/* Scaled canvas wrapper */}
              <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative' }}>
                <div
                  style={{
                    width: CANVAS_W,
                    height: CANVAS_H,
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                  }}
                >
                  {/* SVG edges */}
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    width={CANVAS_W}
                    height={CANVAS_H}
                    style={{ overflow: 'visible' }}
                  >
                    <defs>
                      <marker id="wf-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--muted-foreground))" opacity="0.7" />
                      </marker>
                      <marker id="wf-arrow-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="rgb(248 113 113)" />
                      </marker>
                    </defs>

                    {selectedWf.edges.map((edge) => {
                      const src = selectedWf.steps.find((s) => s.id === edge.sourceStepId);
                      const tgt = selectedWf.steps.find((s) => s.id === edge.targetStepId);
                      if (!src || !tgt) return null;
                      const sp = getPos(src);
                      const tp = getPos(tgt);
                      // port: right-center → left-center
                      const sx = sp.x + CARD_W;
                      const sy = sp.y + CARD_H / 2;
                      const tx = tp.x;
                      const ty = tp.y + CARD_H / 2;
                      const path = bezierPath(sx, sy, tx, ty);
                      return (
                        <g
                          key={edge.id}
                          className="group/edge"
                          style={{ pointerEvents: 'all', cursor: 'pointer' }}
                          onClick={() => deleteEdge.mutate({ wfId: selectedWf.id, edgeId: edge.id })}
                        >
                          <path d={path} stroke="transparent" strokeWidth={14} fill="none" />
                          <path
                            d={path}
                            stroke="hsl(var(--muted-foreground))"
                            strokeOpacity={0.6}
                            strokeWidth={1.8}
                            fill="none"
                            markerEnd="url(#wf-arrow)"
                            className="group-hover/edge:stroke-red-400 transition-colors"
                            style={{ pointerEvents: 'none' }}
                          />
                        </g>
                      );
                    })}

                    {/* Source highlight ring in connect mode */}
                    {connectMode && connectingFrom && (() => {
                      const src = selectedWf.steps.find((s) => s.id === connectingFrom);
                      if (!src) return null;
                      const pos = getPos(src);
                      return (
                        <rect
                          x={pos.x - 6} y={pos.y - 6}
                          width={CARD_W + 12} height={CARD_H + 12}
                          rx={14}
                          fill="none"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          style={{ pointerEvents: 'none' }}
                        />
                      );
                    })()}
                  </svg>

                  {/* Step cards */}
                  {selectedWf.steps.map((step) => {
                    const pos = getPos(step);
                    const isDraggingThis = dragging?.stepId === step.id;
                    const isConnectSrc = connectingFrom === step.id;
                    const isEditing = editingStep === step.id;
                    const typeCfg = STEP_TYPE[step.stepType as WorkflowStepType] ?? STEP_TYPE.action;
                    const statusCfg = STEP_STATUS[step.status as WorkflowStepStatus] ?? STEP_STATUS.idle;

                    return (
                      <div
                        key={step.id}
                        style={{
                          position: 'absolute',
                          left: pos.x,
                          top: pos.y,
                          width: CARD_W,
                          zIndex: isDraggingThis ? 20 : isEditing ? 15 : 1,
                        }}
                        className={`rounded-xl border-2 shadow-sm select-none bg-card transition-shadow ${typeCfg.border} ${
                          step.completed ? 'opacity-70' : ''
                        } ${isConnectSrc ? 'shadow-lg ring-2 ring-primary/50' : ''} ${
                          isDraggingThis ? 'shadow-xl opacity-90' : ''
                        } ${connectMode ? 'cursor-pointer hover:ring-2 hover:ring-primary/40' : ''}`}
                        onClick={() => handleStepClick(step)}
                        onPointerDown={(e) => handleStepPointerDown(e, step)}
                        onPointerMove={(e) => handleStepPointerMove(e, step)}
                        onPointerUp={() => handleStepPointerUp(step)}
                      >
                        {/* Card header */}
                        <div
                          className={`flex items-center justify-between px-3 py-2 rounded-t-[10px] border-b border-border ${typeCfg.header} ${
                            connectMode ? '' : 'cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <div className="flex items-center gap-1.5" data-no-drag>
                            {/* type badge / selector */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  if (connectMode) return;
                                  setTypeMenuStep(typeMenuStep === step.id ? null : step.id);
                                  setStatusMenuStep(null);
                                }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${typeCfg.header} hover:brightness-110`}
                              >
                                <span className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${typeCfg.dot} flex-shrink-0`} />
                                  {typeCfg.icon}
                                  <span className="text-foreground/70">{typeCfg.label}</span>
                                </span>
                              </button>
                              {typeMenuStep === step.id && (
                                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 py-1 min-w-[150px]">
                                  {STEP_TYPE_KEYS.map((t) => (
                                    <button
                                      key={t}
                                      onClick={() => {
                                        if (selectedWf)
                                          updateStep.mutate({ wfId: selectedWf.id, stepId: step.id, stepData: { stepType: t } });
                                        setTypeMenuStep(null);
                                      }}
                                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${step.stepType === t ? 'text-primary' : 'text-foreground'}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${STEP_TYPE[t].dot}`} />
                                      {STEP_TYPE[t].icon}
                                      {STEP_TYPE[t].label}
                                      {step.stepType === t && <Check className="w-3 h-3 ml-auto" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* status badge / selector */}
                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  if (connectMode) return;
                                  setStatusMenuStep(statusMenuStep === step.id ? null : step.id);
                                  setTypeMenuStep(null);
                                }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${statusCfg.cls} ${
                                  statusCfg.pulse ? 'animate-pulse' : ''
                                }`}
                              >
                                {statusCfg.label}
                              </button>
                              {statusMenuStep === step.id && (
                                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
                                  {STEP_STATUS_KEYS.map((st) => (
                                    <button
                                      key={st}
                                      onClick={() => {
                                        if (selectedWf)
                                          updateStep.mutate({ wfId: selectedWf.id, stepId: step.id, stepData: { status: st } });
                                        setStatusMenuStep(null);
                                      }}
                                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${step.status === st ? 'font-semibold' : ''}`}
                                    >
                                      <span className={`px-1.5 py-0.5 rounded text-xs ${STEP_STATUS[st].cls}`}>{STEP_STATUS[st].label}</span>
                                      {step.status === st && <Check className="w-3 h-3 ml-auto text-primary" />}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* header right: step# + delete */}
                          <div className="flex items-center gap-1" data-no-drag>
                            <span className="text-xs text-muted-foreground/60 font-mono">
                              #{selectedWf.steps.indexOf(step) + 1}
                            </span>
                            {!connectMode && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('이 단계를 삭제할까요?'))
                                    deleteStep.mutate({ wfId: selectedWf.id, stepId: step.id });
                                }}
                                className="p-0.5 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card body */}
                        <div className="px-3 py-2.5" data-no-drag>
                          <div className="flex items-start gap-2 mb-1.5">
                            {/* complete toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!connectMode && selectedWf)
                                  updateStep.mutate({ wfId: selectedWf.id, stepId: step.id, stepData: { completed: !step.completed } });
                              }}
                              className={`flex-shrink-0 w-4.5 h-4.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors mt-0.5 ${
                                step.completed
                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                  : 'border-border hover:border-emerald-400'
                              }`}
                            >
                              {step.completed && <Check className="w-2.5 h-2.5" />}
                            </button>

                            {/* title */}
                            {isEditing ? (
                              <input
                                type="text"
                                value={stepTitle}
                                onChange={(e) => setStepTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEditStep();
                                  if (e.key === 'Escape') setEditingStep(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 text-sm font-medium bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
                                autoFocus
                              />
                            ) : (
                              <span
                                className={`flex-1 text-sm font-medium leading-tight ${
                                  step.completed ? 'line-through text-muted-foreground' : ''
                                } ${!connectMode ? 'cursor-text hover:text-primary' : ''}`}
                                onClick={(e) => { e.stopPropagation(); if (!connectMode) startEditStep(step); }}
                              >
                                {step.title}
                              </span>
                            )}
                          </div>

                          {/* description / edit */}
                          {isEditing ? (
                            <div>
                              <textarea
                                value={stepDesc}
                                onChange={(e) => setStepDesc(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => { if (e.key === 'Escape') setEditingStep(null); }}
                                placeholder="상세 내용 입력..."
                                rows={2}
                                className="w-full text-xs bg-background border border-border rounded px-2 py-1 focus:outline-none focus:border-primary resize-none"
                              />
                              <div className="flex gap-1 mt-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); saveEditStep(); }}
                                  className="flex-1 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingStep(null); }}
                                  className="px-2 py-1 text-xs bg-secondary rounded hover:bg-secondary/80 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : step.description ? (
                            <p
                              className={`text-xs text-muted-foreground leading-relaxed line-clamp-2 ${!connectMode ? 'cursor-text hover:text-foreground/80' : ''}`}
                              onClick={(e) => { e.stopPropagation(); if (!connectMode) startEditStep(step); }}
                            >
                              {step.description}
                            </p>
                          ) : !connectMode ? (
                            <p
                              className="text-xs text-muted-foreground/30 italic cursor-text"
                              onClick={(e) => { e.stopPropagation(); startEditStep(step); }}
                            >
                              내용 입력...
                            </p>
                          ) : null}
                        </div>

                        {/* Port indicators */}
                        {!connectMode && (
                          <>
                            {/* left port */}
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-border bg-card"
                              style={{ pointerEvents: 'none' }}
                            />
                            {/* right port */}
                            <div
                              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-border bg-card"
                              style={{ pointerEvents: 'none' }}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}

                  {selectedWf.steps.length === 0 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ pointerEvents: 'none' }}
                    >
                      <p className="text-muted-foreground/30 text-sm">"단계 추가" 버튼으로 워크플로우를 구성하세요</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Zoom hint ── */}
            <div className="absolute bottom-4 right-4 text-xs text-muted-foreground/40 pointer-events-none">
              Ctrl + 스크롤로 줌
            </div>
          </>
        )}
      </main>
    </div>
  );
}
