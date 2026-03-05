import { Pencil, Trash2, CalendarDays, User, Server, AlertTriangle } from 'lucide-react';
import type { Task } from '@/types';
import { type TaskKanbanColumn, classifyTask } from './taskKanbanUtils';

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const PRIORITY_CFG: Record<string, { dot: string; text: string; label: string }> = {
  high:   { dot: 'bg-red-500',   text: 'text-red-400',   label: '높음' },
  medium: { dot: 'bg-blue-500',  text: 'text-blue-400',  label: '보통' },
  low:    { dot: 'bg-slate-400', text: 'text-slate-400', label: '낮음' },
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: Task[]): Task[] {
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

// ── 칸반 컬럼 설정 ─────────────────────────────────────────────────────────────
const COLUMNS: {
  key: TaskKanbanColumn;
  label: string;
  headerCls: string;
  dotCls: string;
  emptyText: string;
}[] = [
  {
    key: 'scheduled',
    label: '예정',
    headerCls: 'border-amber-500/40 bg-amber-500/5',
    dotCls: 'bg-amber-400',
    emptyText: '예정된 작업이 없습니다',
  },
  {
    key: 'delayed',
    label: '지연',
    headerCls: 'border-red-500/40 bg-red-500/5',
    dotCls: 'bg-red-400',
    emptyText: '지연된 작업이 없습니다',
  },
  {
    key: 'completed',
    label: '완료',
    headerCls: 'border-emerald-500/40 bg-emerald-500/5',
    dotCls: 'bg-emerald-400',
    emptyText: '완료된 작업이 없습니다',
  },
];

// ── 카드 ───────────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task: Task;
  column: TaskKanbanColumn;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TaskCard({ task, column, onClick, onEdit, onDelete }: TaskCardProps) {
  const pc = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.medium;

  return (
    <div
      className="bg-card border border-border rounded-lg p-3 group hover:border-primary/30 transition-colors cursor-pointer shadow-sm"
      onClick={onClick}
    >
      {/* 우선순위 + 분류 */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20`}>
          {task.taskCategory}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] ${pc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
          {pc.label}
        </span>
        {column === 'delayed' && (
          <AlertTriangle className="w-3 h-3 text-red-400 ml-auto flex-shrink-0" />
        )}
      </div>

      {/* 내용 */}
      <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed mb-2">
        {task.taskContent}
      </p>

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
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          {column === 'completed'
            ? `완료: ${formatDate(task.completedAt)}`
            : `예정: ${formatDate(task.scheduledAt)}`}
        </span>
      </div>

      {/* 액션 */}
      <div className="flex items-center justify-end gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
  const grouped: Record<TaskKanbanColumn, Task[]> = {
    scheduled: sortTasks(tasks.filter((t) => classifyTask(t) === 'scheduled')),
    delayed:   sortTasks(tasks.filter((t) => classifyTask(t) === 'delayed')),
    completed: sortTasks(tasks.filter((t) => classifyTask(t) === 'completed')),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = grouped[col.key];
        return (
          <div key={col.key} className="flex flex-col min-h-[300px]">
            {/* Column header */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border ${col.headerCls} mb-0`}>
              <span className={`w-2.5 h-2.5 rounded-full ${col.dotCls}`} />
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="ml-auto text-xs text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
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
                    column={col.key}
                    onClick={() => onTaskClick(task)}
                    onEdit={() => onEdit(task)}
                    onDelete={() => onDelete(task)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
