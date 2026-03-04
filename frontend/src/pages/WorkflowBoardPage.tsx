import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitFork, Plus, Trash2, Link2, Unlink, Check, X, ChevronRight } from 'lucide-react';
import { workflowsApi } from '@/services/api';
import type { WorkflowStep, WorkflowStepUpdate } from '@/types';

const CARD_W = 220;
const CARD_H = 140;
const CANVAS_W = 2400;
const CANVAS_H = 1600;

function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const cx1 = sx + dx * 0.5;
  const cy1 = sy;
  const cx2 = tx - dx * 0.5;
  const cy2 = ty;
  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`;
}

export function WorkflowBoardPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<{
    stepId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [showCreateWf, setShowCreateWf] = useState(false);
  const [newWfTitle, setNewWfTitle] = useState('');
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [stepTitle, setStepTitle] = useState('');
  const [stepDesc, setStepDesc] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.getAll().then((r) => r.data),
    staleTime: 1000 * 10,
  });
  const workflows = data?.data ?? [];
  const selectedWf = workflows.find((w) => w.id === selectedId) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows'] });

  const createWorkflow = useMutation({
    mutationFn: (title: string) => workflowsApi.create({ title }),
    onSuccess: (res) => {
      invalidate();
      setSelectedId(res.data.id);
      setShowCreateWf(false);
      setNewWfTitle('');
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: (_, id) => {
      invalidate();
      if (selectedId === id) setSelectedId(null);
    },
  });

  const addStep = useMutation({
    mutationFn: ({ wfId, count }: { wfId: string; count: number }) =>
      workflowsApi.createStep(wfId, {
        title: `단계 ${count + 1}`,
        posX: 80 + (count % 4) * 280,
        posY: 80 + Math.floor(count / 4) * 200,
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

  const getStepPos = (step: WorkflowStep) => localPos[step.id] ?? { x: step.posX, y: step.posY };

  const handleStepPointerDown = (e: React.PointerEvent<HTMLDivElement>, step: WorkflowStep) => {
    if (connectMode) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getStepPos(step);
    setDragging({ stepId: step.id, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y });
  };

  const handleStepPointerMove = (e: React.PointerEvent<HTMLDivElement>, step: WorkflowStep) => {
    if (!dragging || dragging.stepId !== step.id) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
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

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Left panel */}
      <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">워크플로우</span>
          </div>
          <button
            onClick={() => setShowCreateWf(true)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="새 워크플로우"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

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
              const totalCount = wf.steps.length;
              return (
                <div
                  key={wf.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                    selectedId === wf.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary text-foreground'
                  }`}
                  onClick={() => { setSelectedId(wf.id); setConnectMode(false); setConnectingFrom(null); }}
                >
                  <ChevronRight
                    className={`w-3 h-3 flex-shrink-0 transition-transform ${
                      selectedId === wf.id ? 'rotate-90 text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wf.title}</p>
                    <p className="text-xs text-muted-foreground">{totalCount}단계 · {doneCount}/{totalCount} 완료</p>
                    {totalCount > 0 && (
                      <div className="mt-1 h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${(doneCount / totalCount) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${wf.title}" 워크플로우를 삭제할까요?`)) deleteWorkflow.mutate(wf.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 text-muted-foreground transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main canvas */}
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
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold">{selectedWf.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedWf.steps.length}단계 · {selectedWf.steps.filter((s) => s.completed).length} 완료 · {selectedWf.edges.length}개 연결
                </p>
              </div>
              <div className="flex items-center gap-2">
                {connectMode && connectingFrom && (
                  <span className="text-xs px-2.5 py-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full animate-pulse">
                    연결할 다음 단계를 클릭하세요
                  </span>
                )}
                {connectMode && !connectingFrom && (
                  <span className="text-xs px-2.5 py-1 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full">
                    시작 단계를 클릭하세요
                  </span>
                )}
                <button
                  onClick={() => { setConnectMode((m) => !m); setConnectingFrom(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                    connectMode
                      ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                      : 'bg-background border-border hover:bg-secondary text-foreground'
                  }`}
                >
                  {connectMode ? <Unlink className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {connectMode ? '연결 모드 끄기' : '단계 연결'}
                </button>
                <button
                  onClick={() => addStep.mutate({ wfId: selectedWf.id, count: selectedWf.steps.length })}
                  className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  단계 추가
                </button>
              </div>
            </div>

            {/* Canvas scroll area */}
            <div
              className="flex-1 overflow-auto"
              style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            >
              <div ref={canvasRef} className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
                {/* SVG edges */}
                <svg className="absolute inset-0" width={CANVAS_W} height={CANVAS_H} style={{ overflow: 'visible' }}>
                  <defs>
                    <marker id="wf-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
                    </marker>
                  </defs>

                  {selectedWf.edges.map((edge) => {
                    const src = selectedWf.steps.find((s) => s.id === edge.sourceStepId);
                    const tgt = selectedWf.steps.find((s) => s.id === edge.targetStepId);
                    if (!src || !tgt) return null;
                    const sp = getStepPos(src);
                    const tp = getStepPos(tgt);
                    const sx = sp.x + CARD_W / 2;
                    const sy = sp.y + CARD_H / 2;
                    const tx = tp.x + CARD_W / 2;
                    const ty = tp.y + CARD_H / 2;
                    const path = bezierPath(sx, sy, tx, ty);
                    return (
                      <g
                        key={edge.id}
                        className="group/edge cursor-pointer"
                        onClick={() => deleteEdge.mutate({ wfId: selectedWf.id, edgeId: edge.id })}
                      >
                        <path d={path} stroke="transparent" strokeWidth={16} fill="none" />
                        <path
                          d={path}
                          stroke="hsl(var(--muted-foreground))"
                          strokeWidth={2}
                          fill="none"
                          markerEnd="url(#wf-arrow)"
                          className="group-hover/edge:stroke-red-400 transition-colors"
                          style={{ pointerEvents: 'none' }}
                        />
                      </g>
                    );
                  })}

                  {/* Highlight ring around source step in connect mode */}
                  {connectMode && connectingFrom && (() => {
                    const srcStep = selectedWf.steps.find((s) => s.id === connectingFrom);
                    if (!srcStep) return null;
                    const pos = getStepPos(srcStep);
                    return (
                      <rect
                        x={pos.x - 6}
                        y={pos.y - 6}
                        width={CARD_W + 12}
                        height={CARD_H + 12}
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
                  const pos = getStepPos(step);
                  const isEditing = editingStep === step.id;
                  const isConnectSource = connectingFrom === step.id;
                  const isDraggingThis = dragging?.stepId === step.id;

                  return (
                    <div
                      key={step.id}
                      style={{ position: 'absolute', left: pos.x, top: pos.y, width: CARD_W, zIndex: isDraggingThis ? 20 : isEditing ? 15 : 1 }}
                      className={`bg-card border-2 rounded-xl shadow-sm select-none transition-shadow ${
                        step.completed ? 'border-emerald-500/40' :
                        isConnectSource ? 'border-primary shadow-lg' :
                        isDraggingThis ? 'border-primary/60 shadow-xl' :
                        'border-border'
                      } ${connectMode ? 'cursor-pointer hover:border-primary/60' : ''}`}
                      onClick={() => handleStepClick(step)}
                      onPointerDown={(e) => handleStepPointerDown(e, step)}
                      onPointerMove={(e) => handleStepPointerMove(e, step)}
                      onPointerUp={() => handleStepPointerUp(step)}
                    >
                      {/* Header */}
                      <div className={`flex items-center justify-between px-3 py-2 border-b border-border rounded-t-xl ${connectMode ? '' : 'cursor-grab active:cursor-grabbing'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground font-mono">#{selectedWf.steps.indexOf(step) + 1}</span>
                          {step.completed && <span className="text-xs text-emerald-500 font-medium">완료</span>}
                        </div>
                        <div data-no-drag>
                          {!connectMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('이 단계를 삭제할까요?')) deleteStep.mutate({ wfId: selectedWf.id, stepId: step.id });
                              }}
                              className="p-0.5 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="px-3 py-2.5" data-no-drag>
                        <div className="flex items-start gap-2 mb-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!connectMode)
                                updateStep.mutate({ wfId: selectedWf.id, stepId: step.id, stepData: { completed: !step.completed } });
                            }}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5 ${
                              step.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border hover:border-emerald-400'
                            }`}
                          >
                            {step.completed && <Check className="w-3 h-3" />}
                          </button>

                          {isEditing ? (
                            <input
                              type="text"
                              value={stepTitle}
                              onChange={(e) => setStepTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEditStep(); if (e.key === 'Escape') setEditingStep(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 text-sm font-medium bg-background border border-primary rounded px-1.5 py-0.5 focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <span
                              className={`flex-1 text-sm font-medium leading-tight ${step.completed ? 'line-through text-muted-foreground' : ''} ${!connectMode ? 'cursor-text hover:text-primary' : ''}`}
                              onClick={(e) => { e.stopPropagation(); if (!connectMode) startEditStep(step); }}
                            >
                              {step.title}
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <div>
                            <textarea
                              value={stepDesc}
                              onChange={(e) => setStepDesc(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => { if (e.key === 'Escape') setEditingStep(null); }}
                              placeholder="상세 내용 입력..."
                              rows={3}
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
                            className={`text-xs text-muted-foreground leading-relaxed line-clamp-3 ${!connectMode ? 'cursor-text hover:text-foreground/80' : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (!connectMode) startEditStep(step); }}
                          >
                            {step.description}
                          </p>
                        ) : !connectMode ? (
                          <p
                            className="text-xs text-muted-foreground/30 italic cursor-text"
                            onClick={(e) => { e.stopPropagation(); startEditStep(step); }}
                          >
                            클릭하여 내용 입력...
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {selectedWf.steps.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
                    <p className="text-muted-foreground/30 text-sm">"단계 추가" 버튼으로 워크플로우를 구성하세요</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
