import { useState } from 'react';
import { ViewModeBar } from '@/components/common';
import { Plus, Download, Pencil, Trash2, ListTodo, Search, X, ImagePlus, CalendarDays, List, ChevronUp, ChevronDown, ArrowUpDown, GripVertical, Clock, Kanban, GitBranch } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskModal, TaskDetailModal, TaskCalendar, TaskKanban } from '@/components/tasks';
import { MODULE_CONFIG } from '@/components/tasks/taskKanbanUtils';
import { saveTaskImages } from '@/lib/taskImages';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { tasksApi } from '@/services/api';
import { useLocalOrder } from '@/hooks/useLocalOrder';
import { Task, TaskCreate, TaskUpdate, TaskModule } from '@/types';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hasLocalImages(id: string): boolean {
  try {
    const raw = localStorage.getItem('k8s:img:task:' + id);
    if (!raw) return false;
    const arr = JSON.parse(raw) as string[];
    return arr.length > 0;
  } catch {
    return false;
  }
}

const PRIORITY_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  high: { dot: 'bg-red-500', label: '높음', text: 'text-red-400' },
  medium: { dot: 'bg-blue-500', label: '보통', text: 'text-blue-400' },
  low: { dot: 'bg-slate-400', label: '낮음', text: 'text-slate-400' },
};

type ViewMode = 'table' | 'calendar' | 'kanban';

type TaskSortKey = 'kanbanStatus' | 'priority' | 'assignee' | 'clusterName' | 'taskCategory' | 'scheduledAt' | 'completedAt';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: TaskSortKey;
  sortKey: TaskSortKey | '';
  sortDir: 'asc' | 'desc';
  onSort: (col: TaskSortKey) => void;
  className?: string;
}) {
  const isActive = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground transition-colors ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === 'asc' ? (
            <ChevronUp className="w-3 h-3 text-primary" />
          ) : (
            <ChevronDown className="w-3 h-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </span>
    </th>
  );
}

function SortableTaskRow({
  id, isDragDisabled, children,
}: { id: string; isDragDisabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: isDragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-3 w-7">
        {!isDragDisabled && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded">
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </td>
      {children}
    </tr>
  );
}

export function TaskBoardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterClusterId, setFilterClusterId] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterModule, setFilterModule] = useState<TaskModule | ''>('');
  const [sortKey, setSortKey] = useState<TaskSortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showDatetime, setShowDatetime] = useState(false);

  const { clusters } = useClusterStore();
  useClusters();

  const filters = {
    clusterId: filterClusterId || undefined,
    assignee: filterAssignee || undefined,
    taskCategory: filterCategory || undefined,
    priority: filterPriority || undefined,
    module: filterModule || undefined,
    scheduledFrom: filterFrom || undefined,
    scheduledTo: filterTo || undefined,
  };

  const { data, isLoading } = useTasks(filters);
  const tasks = data?.data ?? [];

  const { orderedItems: dndTasks, handleDragEnd: dndHandleDragEnd } = useLocalOrder(tasks, 'k8s:order:tasks');
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSort = (col: TaskSortKey) => {
    if (sortKey === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('asc');
    }
  };

  // Column sort overrides DnD order; when no sort active, use DnD order
  const sortedTasks = sortKey
    ? [...tasks].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'kanbanStatus') {
          const ORDER: Record<string, number> = { backlog: 0, todo: 1, in_progress: 2, review_test: 3, done: 4 };
          cmp = (ORDER[a.kanbanStatus ?? 'todo'] ?? 1) - (ORDER[b.kanbanStatus ?? 'todo'] ?? 1);
        } else if (sortKey === 'priority') {
          cmp = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
        } else if (sortKey === 'assignee') {
          cmp = a.assignee.localeCompare(b.assignee);
        } else if (sortKey === 'clusterName') {
          cmp = (a.clusterName ?? '').localeCompare(b.clusterName ?? '');
        } else if (sortKey === 'taskCategory') {
          cmp = a.taskCategory.localeCompare(b.taskCategory);
        } else if (sortKey === 'scheduledAt') {
          cmp = a.scheduledAt.localeCompare(b.scheduledAt);
        } else if (sortKey === 'completedAt') {
          cmp = (a.completedAt ?? '').localeCompare(b.completedAt ?? '');
        }
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : dndTasks;

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleCreate = async (formData: TaskCreate, images: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await createTask.mutateAsync(formData);
    const newId: string | undefined = res?.data?.id ?? res?.id;
    if (images.length > 0 && newId) {
      saveTaskImages(newId, images);
    }
  };

  const handleUpdate = async (formData: TaskCreate, images: string[]) => {
    if (!editTask) return;
    await updateTask.mutateAsync({ id: editTask.id, data: formData as TaskUpdate });
    saveTaskImages(editTask.id, images);
    setEditTask(null);
  };

  const handleDelete = (task: Task) => {
    if (!confirm(`"${task.taskCategory}" 작업을 삭제하시겠습니까?`)) return;
    deleteTask.mutate(task.id);
    localStorage.removeItem('k8s:img:task:' + task.id);
  };

  const handleEdit = (task: Task) => {
    setSelectedTask(null);
    setEditTask(task);
    setParentTask(null);
    setShowModal(true);
  };

  const handleAddSubTask = (task: Task) => {
    setSelectedTask(null);
    setEditTask(null);
    setParentTask(task);
    setShowModal(true);
  };

  const handleDetailEdit = (task: Task) => {
    setSelectedTask(null);
    setEditTask(task);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditTask(null);
    setParentTask(null);
  };

  const handleExportCsv = async () => {
    try {
      const { data: blobData } = await tasksApi.exportCsv(filters);
      const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed:', e);
    }
  };

  const clearFilters = () => {
    setFilterClusterId('');
    setFilterAssignee('');
    setFilterCategory('');
    setFilterPriority('');
    setFilterModule('');
    setFilterFrom('');
    setFilterTo('');
  };

  const hasFilters = filterClusterId || filterAssignee || filterCategory || filterPriority || filterModule || filterFrom || filterTo;

  const inProgressCount = tasks.filter((t) => t.kanbanStatus === 'in_progress').length;
  const doneCount = tasks.filter((t) => t.kanbanStatus === 'done').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ListTodo className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">작업 관리 게시판</h1>
            {tasks.length > 0 && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                  전체 {tasks.length}
                </span>
                {inProgressCount > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    inProgressCount >= 2
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}>
                    WIP {inProgressCount}/2
                    {inProgressCount >= 2 && ' ⚠'}
                  </span>
                )}
                {doneCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Done {doneCount}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {viewMode === 'table' && (
              <button
                onClick={() => setShowDatetime((v) => !v)}
                className={`px-3 py-2 text-sm font-medium border rounded-lg transition-colors flex items-center gap-1.5 ${
                  showDatetime
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary hover:bg-secondary/80 border-border text-muted-foreground hover:text-foreground'
                }`}
                title="예정일/완료일 시간 표시 on/off"
              >
                <Clock className="w-4 h-4" />
                시간 표시
              </button>
            )}

            {/* View mode toggle */}
            <ViewModeBar
              modes={[
                { id: 'table',    label: '목록', icon: <List        className="w-3.5 h-3.5" /> },
                { id: 'calendar', label: '달력', icon: <CalendarDays className="w-3.5 h-3.5" /> },
                { id: 'kanban',   label: '칸반', icon: <Kanban      className="w-3.5 h-3.5" /> },
              ]}
              active={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              showStylePanel={false}
            />

            {viewMode !== 'calendar' && tasks.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                CSV 추출
              </button>
            )}
            <button
              onClick={() => { setEditTask(null); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              작업 등록
            </button>
          </div>
        </div>

        {/* 모듈 뷰 탭 */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setFilterModule('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              filterModule === ''
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            전체 흐름
          </button>
          {(Object.entries(MODULE_CONFIG) as [TaskModule, { label: string; cls: string }][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterModule(filterModule === key ? '' : key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filterModule === key
                  ? `${cfg.cls} border-current`
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">필터</span>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
                초기화
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <select
              value={filterClusterId}
              onChange={(e) => setFilterClusterId(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">전체 클러스터</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <input
              type="text"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              placeholder="담당자 검색"
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            />

            <input
              type="text"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              placeholder="작업 분류 검색"
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            />

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            >
              <option value="">전체 우선순위</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>

            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
              title="예정일 시작"
            />

            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
              title="예정일 종료"
            />
          </div>
        </div>

        {/* Kanban view */}
        {viewMode === 'kanban' && (
          isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-64 rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <TaskKanban
              tasks={sortedTasks}
              onTaskClick={setSelectedTask}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )
        )}

        {/* Table / Calendar view */}
        {viewMode !== 'kanban' && (viewMode === 'calendar' ? (
          <div className="bg-card border border-border rounded-xl p-6">
            {isLoading ? (
              <div className="grid grid-cols-7 gap-0">
                {[...Array(35)].map((_, i) => (
                  <div key={i} className="h-[88px] border border-border animate-pulse bg-muted/20" />
                ))}
              </div>
            ) : (
              <TaskCalendar tasks={tasks} onTaskClick={setSelectedTask} />
            )}
          </div>
        ) : isLoading ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 border-b border-border last:border-b-0 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <ListTodo className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">
              {hasFilters ? '검색 조건에 해당하는 작업이 없습니다.' : '등록된 작업이 없습니다.'}
            </p>
            {!hasFilters && (
              <button
                onClick={() => { setEditTask(null); setShowModal(true); }}
                className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + 첫 번째 작업 등록
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="w-7" />
                    <SortTh label="상태" col="kanbanStatus" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="우선순위" col="priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="담당자" col="assignee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="대상 클러스터" col="clusterName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="작업 분류" col="taskCategory" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">작업 내용</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">작업 결과</th>
                    <SortTh label="예정일" col="scheduledAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="완료일" col="completedAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">비고</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => { if (e.over) dndHandleDragEnd(String(e.active.id), String(e.over.id)); }}>
                  <SortableContext items={sortedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                  {sortedTasks.map((task) => {
                    const pStyle = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
                    const hasImages = hasLocalImages(task.id);
                    const ks = task.kanbanStatus ?? 'todo';
                    const KS_DOT: Record<string, string> = {
                      backlog: 'bg-slate-400', todo: 'bg-blue-400', in_progress: 'bg-amber-400',
                      review_test: 'bg-purple-400', done: 'bg-emerald-400',
                    };
                    const KS_TEXT: Record<string, string> = {
                      backlog: 'text-slate-400', todo: 'text-blue-400', in_progress: 'text-amber-400',
                      review_test: 'text-purple-400', done: 'text-emerald-400',
                    };
                    const KS_LABEL: Record<string, string> = {
                      backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress',
                      review_test: 'Review', done: 'Done',
                    };
                    return (
                      <SortableTaskRow key={task.id} id={task.id} isDragDisabled={!!sortKey}>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${KS_DOT[ks] ?? 'bg-slate-400'}`} />
                            <span className={`text-xs font-medium whitespace-nowrap ${KS_TEXT[ks] ?? 'text-slate-400'}`}>
                              {KS_LABEL[ks] ?? ks}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pStyle.dot}`} />
                            <span className={`text-xs font-medium ${pStyle.text}`}>{pStyle.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap cursor-pointer" onClick={() => setSelectedTask(task)}>{task.assignee}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap cursor-pointer" onClick={() => setSelectedTask(task)}>
                          {task.clusterName || '-'}
                        </td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                            {task.taskCategory}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <div className="flex items-start gap-1.5">
                            <p className="line-clamp-2 text-foreground/90">{task.taskContent}</p>
                            {hasImages && (
                              <span title="이미지 첨부 있음"><ImagePlus className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" /></span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <p className="line-clamp-2 text-muted-foreground">
                            {task.resultContent || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs cursor-pointer" onClick={() => setSelectedTask(task)}>
                          {showDatetime ? formatDateTime(task.scheduledAt) : formatDate(task.scheduledAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs cursor-pointer" onClick={() => setSelectedTask(task)}>
                          {showDatetime ? formatDateTime(task.completedAt) : formatDate(task.completedAt)}
                        </td>
                        <td className="px-4 py-3 max-w-[120px] cursor-pointer" onClick={() => setSelectedTask(task)}>
                          <p className="line-clamp-2 text-muted-foreground text-xs">
                            {task.remarks || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(task); }}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                              title="수정"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddSubTask(task); }}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-primary"
                              title="하위 작업 추가"
                            >
                              <GitBranch className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(task); }}
                              className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </SortableTaskRow>
                    );
                  })}
                </tbody>
                </SortableContext>
                </DndContext>
              </table>
            </div>
          </div>
        ))}
      </main>

      <TaskModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSubmit={editTask ? handleUpdate : handleCreate}
        clusters={clusters}
        editTask={editTask}
        parentTask={parentTask}
      />

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={handleDetailEdit}
        />
      )}
    </div>
  );
}
