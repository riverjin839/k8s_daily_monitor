import { useState } from 'react';
import { Pencil, Trash2, CalendarDays, User, Server, ChevronRight, ChevronLeft, Clock, AlertTriangle } from 'lucide-react';
import type { Task, KanbanStatus } from '@/types';
import {
  KANBAN_COLUMNS,
  KANBAN_STATUS_ORDER,
  KANBAN_STATUS_LABEL,
  MODULE_CONFIG,
  TYPE_LABEL_CONFIG,
  getNextStatus,
  getPrevStatus,
} from './taskKanbanUtils';
import { usePatchTaskStatus } from '@/hooks/useTasks';

// ── 우선순위 설정 ──────────────────────────────────────────────────────────────
const PRIORITY_CFG: Record<string, { dot: string; text: string; label: string }> = {
  high:   { dot: 'bg-red-500',   text: 'text-red-400',   label: '높음' },
  medium: { dot: 'bg-blue-500',  text: 'text-blue-400',  label: '보통' },
  low:    { dot: 'bg-slate-400', text: 'text-slate-400', label: '낮음' },
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const po = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (po !== 0) return po;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

function formatDate(s?: string | null) {
  if (!s) return '-';
  return s.slice(0, 10);
}

// ── WIP 경고 Toast ─────────────────────────────────────────────────────────────
interface WipToastProps {
  onClose: () => void;
}

function WipToast({ onClose }: WipToastProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-amber-500/90 text-amber-950 rounded-xl shadow-lg text-sm font-medium backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>WIP 한도 초과! In Progress는 동시 2개로 제한됩니다.</span>
      <button onClick={onClose} className="ml-2 text-amber-800 hover:text-amber-900 font-bold text-base leading-none">×</button>
    </div>
  );
}

// ── 컬럼 이동 드롭다운 ─────────────────────────────────────────────────────────
interface MoveMenuProps {
  currentStatus: KanbanStatus;
  onMove: (to: KanbanStatus) => void;
}

function MoveMenu({ currentStatus, onMove }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  const others = KANBAN_STATUS_ORDER.filter((s) => s !== currentStatus);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors text-[10px] font-medium px-1.5"
        title="다른 컬럼으로 이동"
      >
        이동
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 z-20 bg-card border border-border rounded-lg shadow-xl overflow-hidden min-w-[140px]">
            {others.map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); setOpen(false); onMove(s); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-foreground/80 hover:text-foreground"
              >
                {KANBAN_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── 카드 ───────────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (to: KanbanStatus) => void;
}

function TaskCard({ task, onClick, onEdit, onDelete, onMove }: TaskCardProps) {
  const pc = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.medium;
  const prev = getPrevStatus(task.kanbanStatus);
  const next = getNextStatus(task.kanbanStatus);
  const moduleCfg = task.module ? MODULE_CONFIG[task.module] : null;
  const typeCfg = task.typeLabel ? TYPE_LABEL_CONFIG[task.typeLabel] : null;

  return (
    <div
      className="bg-card border border-border rounded-lg p-3 group hover:border-primary/30 transition-colors cursor-pointer shadow-sm"
      onClick={onClick}
    >
      {/* 배지 행 */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {moduleCfg && (
          <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${moduleCfg.cls}`}>
            {moduleCfg.label}
          </span>
        )}
        {typeCfg && (
          <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${typeCfg.cls}`}>
            {typeCfg.label}
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {task.taskCategory}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] ml-auto ${pc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
          {pc.label}
        </span>
      </div>

      {/* 작업 내용 */}
      <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed mb-2">
        {task.taskContent}
      </p>

      {/* 완료 조건 (in_progress / review_test 에서만 표시) */}
      {task.doneCondition && (task.kanbanStatus === 'in_progress' || task.kanbanStatus === 'review_test') && (
        <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mb-1.5 italic">
          ✓ {task.doneCondition}
        </p>
      )}

      {/* 메타 */}
      <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3 flex-shrink-0" />
          {task.assignee}
          {task.clusterName && (
            <>
              <Server className="w-3 h-3 flex-shrink-0 ml-1" />
              {task.clusterName}
            </>
          )}
          {task.effortHours && (
            <>
              <Clock className="w-3 h-3 flex-shrink-0 ml-1" />
              {task.effortHours}h
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          {task.kanbanStatus === 'done'
            ? `완료: ${formatDate(task.completedAt)}`
            : `예정: ${formatDate(task.scheduledAt)}`}
        </span>
      </div>

      {/* 액션 — hover 시 표시 */}
      <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* 이전/다음 컬럼 이동 버튼 */}
        <div className="flex items-center gap-0.5">
          {prev && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(prev); }}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={`← ${KANBAN_STATUS_LABEL[prev]}`}
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
          )}
          {next && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(next); }}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={`→ ${KANBAN_STATUS_LABEL[next]}`}
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
          <MoveMenu currentStatus={task.kanbanStatus} onMove={onMove} />
        </div>

        {/* 편집/삭제 버튼 */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="수정"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
            title="삭제"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
interface TaskKanbanProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskKanban({ tasks, onTaskClick, onEdit, onDelete }: TaskKanbanProps) {
  const patchStatus = usePatchTaskStatus();
  const [showWipWarning, setShowWipWarning] = useState(false);

  const grouped: Record<KanbanStatus, Task[]> = {
    backlog:     sortByPriority(tasks.filter((t) => t.kanbanStatus === 'backlog')),
    todo:        sortByPriority(tasks.filter((t) => t.kanbanStatus === 'todo')),
    in_progress: sortByPriority(tasks.filter((t) => t.kanbanStatus === 'in_progress')),
    review_test: sortByPriority(tasks.filter((t) => t.kanbanStatus === 'review_test')),
    done:        sortByPriority(tasks.filter((t) => t.kanbanStatus === 'done')),
  };

  const handleMove = (task: Task, to: KanbanStatus) => {
    patchStatus.mutate(
      { id: task.id, kanbanStatus: to },
      {
        onSuccess: (res) => {
          if (res.data.wipWarning) {
            setShowWipWarning(true);
          }
        },
      }
    );
  };

  return (
    <>
      {showWipWarning && <WipToast onClose={() => setShowWipWarning(false)} />}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((col) => {
          const colTasks = grouped[col.key];
          const isWipCol = col.key === 'in_progress';
          const wipCount = colTasks.length;
          const wipOver = isWipCol && col.wipLimit !== undefined && wipCount > col.wipLimit;

          return (
            <div key={col.key} className="flex flex-col min-w-[240px] max-w-[280px] flex-shrink-0">
              {/* 컬럼 헤더 */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border ${col.headerCls}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${col.dotCls}`} />
                <span className="text-sm font-semibold">{col.label}</span>
                {isWipCol && col.wipLimit !== undefined && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ml-auto ${
                    wipOver
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-background/60 text-muted-foreground'
                  }`}>
                    {wipCount} / {col.wipLimit}
                    {wipOver && ' ⚠'}
                  </span>
                )}
                {!isWipCol && (
                  <span className="ml-auto text-xs text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                )}
              </div>

              {/* 카드 목록 */}
              <div className="flex-1 bg-muted/10 border border-t-0 border-border rounded-b-lg p-2 flex flex-col gap-2 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground/50 text-center py-4">{col.emptyText}</p>
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => onTaskClick(task)}
                      onEdit={() => onEdit(task)}
                      onDelete={() => onDelete(task)}
                      onMove={(to) => handleMove(task, to)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
