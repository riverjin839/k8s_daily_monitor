import { useState } from 'react';
import { Plus, Download, Pencil, Trash2, ListTodo, Search, X } from 'lucide-react';
import { Header } from '@/components/layout';
import { TaskModal } from '@/components/tasks';
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/useTasks';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { tasksApi } from '@/services/api';
import { Task, TaskCreate, TaskUpdate } from '@/types';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
}

const PRIORITY_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  high: { dot: 'bg-red-500', label: '높음', text: 'text-red-400' },
  medium: { dot: 'bg-blue-500', label: '보통', text: 'text-blue-400' },
  low: { dot: 'bg-slate-400', label: '낮음', text: 'text-slate-400' },
};

export function TaskBoardPage() {
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [filterClusterId, setFilterClusterId] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { clusters } = useClusterStore();
  useClusters();

  const filters = {
    clusterId: filterClusterId || undefined,
    assignee: filterAssignee || undefined,
    taskCategory: filterCategory || undefined,
    priority: filterPriority || undefined,
    scheduledFrom: filterFrom || undefined,
    scheduledTo: filterTo || undefined,
  };

  const { data, isLoading } = useTasks(filters);
  const tasks = data?.data ?? [];

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleCreate = (formData: TaskCreate) => {
    createTask.mutate(formData);
  };

  const handleUpdate = (formData: TaskCreate) => {
    if (!editTask) return;
    updateTask.mutate({ id: editTask.id, data: formData as TaskUpdate });
    setEditTask(null);
  };

  const handleDelete = (task: Task) => {
    if (!confirm(`"${task.taskCategory}" 작업을 삭제하시겠습니까?`)) return;
    deleteTask.mutate(task.id);
  };

  const handleEdit = (task: Task) => {
    setEditTask(task);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditTask(null);
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
    setFilterFrom('');
    setFilterTo('');
  };

  const hasFilters = filterClusterId || filterAssignee || filterCategory || filterPriority || filterFrom || filterTo;

  const pendingCount = tasks.filter((t) => !t.completedAt).length;
  const completedCount = tasks.filter((t) => t.completedAt).length;

  return (
    <div className="min-h-screen bg-background">
      <Header />

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
                {pendingCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    진행중 {pendingCount}
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    완료 {completedCount}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {tasks.length > 0 && (
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

        {/* Table */}
        {isLoading ? (
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">상태</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">우선순위</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">담당자</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">대상 클러스터</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">작업 분류</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">작업 내용</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">작업 결과</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">예정일</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">완료일</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">비고</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const isCompleted = !!task.completedAt;
                    const pStyle = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
                    return (
                      <tr
                        key={task.id}
                        className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            <span
                              className={`text-xs font-medium ${
                                isCompleted ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {isCompleted ? '완료' : '진행중'}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pStyle.dot}`} />
                            <span className={`text-xs font-medium ${pStyle.text}`}>{pStyle.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{task.assignee}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {task.clusterName || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                            {task.taskCategory}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="line-clamp-2 text-foreground/90">{task.taskContent}</p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="line-clamp-2 text-muted-foreground">
                            {task.resultContent || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                          {formatDate(task.scheduledAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs">
                          {formatDate(task.completedAt)}
                        </td>
                        <td className="px-4 py-3 max-w-[120px]">
                          <p className="line-clamp-2 text-muted-foreground text-xs">
                            {task.remarks || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(task)}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                              title="수정"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(task)}
                              className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <TaskModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSubmit={editTask ? handleUpdate : handleCreate}
        clusters={clusters}
        editTask={editTask}
      />
    </div>
  );
}
