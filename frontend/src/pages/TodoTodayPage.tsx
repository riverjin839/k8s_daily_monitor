import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CalendarCheck2,
  RefreshCw,
  ArrowRight,
  Clock,
  CheckCircle2,
  CircleDashed,
  AlertCircle,
  Loader2,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { todayTasksApi, tasksApi, TodayTaskGroup } from '@/services/api';
import { Task, TaskCreate, KanbanStatus } from '@/types';
import { TaskModal } from '@/components/tasks';
import { useClusters } from '@/hooks/useCluster';
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { saveTaskImages } from '@/lib/taskImages';

const PRIORITY_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  high:   { dot: 'bg-red-500',   label: '높음', text: 'text-red-400' },
  medium: { dot: 'bg-blue-500',  label: '보통', text: 'text-blue-400' },
  low:    { dot: 'bg-slate-400', label: '낮음', text: 'text-slate-400' },
};

const KANBAN_STYLES: Record<KanbanStatus, { label: string; color: string; icon: React.ReactNode }> = {
  backlog:     { label: '백로그',   color: 'text-slate-400',  icon: <CircleDashed className="w-3.5 h-3.5" /> },
  todo:        { label: '할일',     color: 'text-blue-400',   icon: <CircleDashed className="w-3.5 h-3.5" /> },
  in_progress: { label: '진행 중', color: 'text-amber-400',  icon: <Clock className="w-3.5 h-3.5" /> },
  review_test: { label: '검토/테스트', color: 'text-purple-400', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  done:        { label: '완료',     color: 'text-green-400',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatScheduledAt(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  onEdit: (task: Task) => void;
  isUpdating: boolean;
  highlight?: 'today' | 'inprogress';
}

function TaskCard({ task, onStatusChange, onEdit, isUpdating, highlight }: TaskCardProps) {
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const kanban = KANBAN_STYLES[task.kanbanStatus] || KANBAN_STYLES.todo;

  return (
    <div
      className={`rounded-lg border p-3.5 flex flex-col gap-2 transition-colors hover:border-border/80 ${
        task.kanbanStatus === 'done'
          ? 'bg-muted/20 border-border/40 opacity-60'
          : highlight === 'inprogress'
          ? 'bg-amber-500/5 border-amber-500/20'
          : 'bg-card border-border'
      }`}
    >
      {/* 상단: 우선순위 + 상태 + 시간 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priority.dot}`} />
          <span className={`text-xs font-medium flex-shrink-0 ${priority.text}`}>{priority.label}</span>
          {task.module && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0">
              {task.module}
            </span>
          )}
          {task.clusterName && (
            <span className="text-xs text-muted-foreground/60 truncate">{task.clusterName}</span>
          )}
        </div>
        <div className={`flex items-center gap-1 text-xs flex-shrink-0 ${kanban.color}`}>
          {kanban.icon}
          <span>{kanban.label}</span>
        </div>
      </div>

      {/* 작업 내용 */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-foreground leading-snug flex-1 min-w-0">
          {task.taskContent}
        </p>
        <button
          onClick={() => onEdit(task)}
          className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5 transition-colors"
          title="수정"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 카테고리 + 예정시간 */}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{task.taskCategory}</span>
        {highlight === 'today' && task.scheduledAt && (
          <span className="flex-shrink-0 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatScheduledAt(task.scheduledAt)}
          </span>
        )}
      </div>

      {/* 퀵 액션 버튼 */}
      {task.kanbanStatus !== 'done' && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
          {task.kanbanStatus !== 'in_progress' && (
            <button
              onClick={() => onStatusChange(task.id, 'in_progress')}
              disabled={isUpdating}
              className="flex-1 text-xs py-1 px-2 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              진행 시작
            </button>
          )}
          <button
            onClick={() => onStatusChange(task.id, 'done')}
            disabled={isUpdating}
            className="flex-1 text-xs py-1 px-2 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            완료 처리
          </button>
        </div>
      )}
    </div>
  );
}

interface AssigneeColumnProps {
  group: TodayTaskGroup;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  onEdit: (task: Task) => void;
  updatingId: string | null;
}

function AssigneeColumn({ group, onStatusChange, onEdit, updatingId }: AssigneeColumnProps) {
  const totalCount = group.todayTasks.length + group.inProgressTasks.length;
  const doneCount = [...group.todayTasks, ...group.inProgressTasks].filter(
    (t) => t.kanbanStatus === 'done'
  ).length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 min-w-[280px] max-w-[320px] flex-shrink-0">
      {/* 담당자 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {group.assignee.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{group.assignee}</p>
            <p className="text-xs text-muted-foreground">
              {doneCount}/{totalCount}건 완료
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
      </div>

      {/* 진행률 바 */}
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 오늘 예정 */}
      {group.todayTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
            <CalendarCheck2 className="w-3.5 h-3.5" />
            <span>오늘 예정 ({group.todayTasks.length})</span>
          </div>
          {group.todayTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              isUpdating={updatingId === task.id}
              highlight="today"
            />
          ))}
        </div>
      )}

      {/* 진행 중 */}
      {group.inProgressTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            <span>진행 중 ({group.inProgressTasks.length})</span>
          </div>
          {group.inProgressTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              isUpdating={updatingId === task.id}
              highlight="inprogress"
            />
          ))}
        </div>
      )}

      {totalCount === 0 && (
        <div className="rounded-lg border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground">
          오늘 할 일 없음
        </div>
      )}
    </div>
  );
}

export function TodoTodayPage() {
  const queryClient = useQueryClient();
  const { data: clusterList = [] } = useClusters();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const today = getTodayString();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tasks', 'today'],
    queryFn: () => todayTasksApi.getSummary().then((r) => r.data),
    refetchInterval: 60000, // 1분 자동 갱신
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: KanbanStatus }) =>
      tasksApi.patchStatus(id, status),
    onMutate: ({ id }) => setUpdatingId(id),
    onSettled: () => {
      setUpdatingId(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const handleStatusChange = (id: string, status: KanbanStatus) => {
    statusMutation.mutate({ id, status });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
  };

  const handleCreateSubmit = async (formData: TaskCreate, images: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await createTask.mutateAsync(formData);
    const newId: string | undefined = res?.data?.id ?? res?.id;
    if (images.length > 0 && newId) saveTaskImages(newId, images);
    setIsAddOpen(false);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleUpdateSubmit = async (formData: TaskCreate, images: string[]) => {
    if (!editingTask) return;
    await updateTask.mutateAsync({ id: editingTask.id, data: formData });
    saveTaskImages(editingTask.id, images);
    setEditingTask(null);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const totalToday = data?.totalToday ?? 0;
  const totalInProgress = data?.totalInProgress ?? 0;
  const groups = data?.groups ?? [];

  const allTasks = groups.flatMap((g) => [...g.todayTasks, ...g.inProgressTasks]);
  const doneCount = allTasks.filter((t) => t.kanbanStatus === 'done').length;
  const totalCount = allTasks.length;
  const overallProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="p-6 flex flex-col gap-6 min-h-screen">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">오늘 할일</h1>
            <span className="text-sm text-muted-foreground">{today}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            오늘 예정된 작업과 진행 중인 작업을 담당자별로 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/tasks"
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
          >
            작업 게시판
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            작업 추가
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">오늘 예정</p>
          <p className="text-2xl font-bold text-blue-400">{totalToday}</p>
          <p className="text-xs text-muted-foreground mt-0.5">건</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">진행 중</p>
          <p className="text-2xl font-bold text-amber-400">{totalInProgress}</p>
          <p className="text-xs text-muted-foreground mt-0.5">건</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">완료</p>
          <p className="text-2xl font-bold text-green-400">{doneCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">/ {totalCount}건</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">전체 진행률</p>
          <p className="text-2xl font-bold text-primary">{overallProgress}%</p>
          <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 본문 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm">데이터를 불러오는 중 오류가 발생했습니다.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
          >
            다시 시도
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <CalendarCheck2 className="w-12 h-12 opacity-30" />
          <div className="text-center">
            <p className="text-base font-medium">오늘 예정된 작업이 없습니다</p>
            <p className="text-sm mt-1 opacity-70">
              작업 게시판에서 오늘 날짜로 작업을 등록하거나, 진행 중 작업이 있으면 여기에 표시됩니다.
            </p>
          </div>
          <Link
            to="/tasks"
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
          >
            작업 게시판으로 이동
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-5 min-w-max">
            {groups.map((group) => (
              <AssigneeColumn
                key={group.assignee}
                group={group}
                onStatusChange={handleStatusChange}
                onEdit={handleEdit}
                updatingId={updatingId}
              />
            ))}
          </div>
        </div>
      )}

      {/* 작업 추가 모달 */}
      {isAddOpen && (
        <TaskModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSubmit={handleCreateSubmit}
          clusters={clusterList}
        />
      )}

      {/* 작업 수정 모달 */}
      {editingTask && (
        <TaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={handleUpdateSubmit}
          editTask={editingTask}
          clusters={clusterList}
        />
      )}
    </div>
  );
}
