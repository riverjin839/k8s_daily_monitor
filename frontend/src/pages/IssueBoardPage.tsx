import { useState } from 'react';
import { Plus, Download, Pencil, Trash2, ClipboardList, Search, X, ImagePlus, ChevronUp, ChevronDown, ArrowUpDown, GripVertical, Clock, Kanban, List } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IssueModal, IssueDetailModal, IssueKanban } from '@/components/issues';
import { saveIssueImages } from '@/lib/issueImages';
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue } from '@/hooks/useIssues';
import { useLocalOrder } from '@/hooks/useLocalOrder';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { issuesApi } from '@/services/api';
import { Issue, IssueCreate, IssueUpdate } from '@/types';

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
    const raw = localStorage.getItem('k8s:img:issue:' + id);
    if (!raw) return false;
    const arr = JSON.parse(raw) as string[];
    return arr.length > 0;
  } catch {
    return false;
  }
}

const STATUS_DOT: Record<string, string> = {
  resolved: 'bg-emerald-500',
  unresolved: 'bg-amber-500',
};

type IssueSortKey = 'status' | 'assignee' | 'clusterName' | 'issueArea' | 'occurredAt' | 'resolvedAt';

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: IssueSortKey;
  sortKey: IssueSortKey | '';
  sortDir: 'asc' | 'desc';
  onSort: (col: IssueSortKey) => void;
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

function SortableIssueRow({
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

export function IssueBoardPage() {
  const [showModal, setShowModal] = useState(false);
  const [editIssue, setEditIssue] = useState<Issue | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [filterClusterId, setFilterClusterId] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortKey, setSortKey] = useState<IssueSortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showDatetime, setShowDatetime] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  const { clusters } = useClusterStore();
  useClusters();

  const filters = {
    clusterId: filterClusterId || undefined,
    assignee: filterAssignee || undefined,
    issueArea: filterArea || undefined,
    occurredFrom: filterFrom || undefined,
    occurredTo: filterTo || undefined,
  };

  const { data, isLoading } = useIssues(filters);
  const issues = data?.data ?? [];

  const { orderedItems: dndIssues, handleDragEnd: dndHandleDragEnd } = useLocalOrder(issues, 'k8s:order:issues');
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSort = (col: IssueSortKey) => {
    if (sortKey === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('asc');
    }
  };

  const sortedIssues = sortKey
    ? [...issues].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'status') {
      cmp = (a.resolvedAt ? 1 : 0) - (b.resolvedAt ? 1 : 0);
    } else if (sortKey === 'assignee') {
      cmp = a.assignee.localeCompare(b.assignee);
    } else if (sortKey === 'clusterName') {
      cmp = (a.clusterName ?? '').localeCompare(b.clusterName ?? '');
    } else if (sortKey === 'issueArea') {
      cmp = a.issueArea.localeCompare(b.issueArea);
    } else if (sortKey === 'occurredAt') {
      cmp = a.occurredAt.localeCompare(b.occurredAt);
    } else if (sortKey === 'resolvedAt') {
      cmp = (a.resolvedAt ?? '').localeCompare(b.resolvedAt ?? '');
    }
      return sortDir === 'asc' ? cmp : -cmp;
    })
    : dndIssues;

  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();

  const handleCreate = async (formData: IssueCreate, images: string[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await createIssue.mutateAsync(formData);
    const newId: string | undefined = res?.data?.id ?? res?.id;
    if (images.length > 0 && newId) {
      saveIssueImages(newId, images);
    }
  };

  const handleUpdate = async (formData: IssueCreate, images: string[]) => {
    if (!editIssue) return;
    await updateIssue.mutateAsync({ id: editIssue.id, data: formData as IssueUpdate });
    saveIssueImages(editIssue.id, images);
    setEditIssue(null);
  };

  const handleDelete = (issue: Issue) => {
    if (!confirm(`"${issue.issueArea}" 이슈를 삭제하시겠습니까?`)) return;
    deleteIssue.mutate(issue.id);
    localStorage.removeItem('k8s:img:issue:' + issue.id);
  };

  const handleEdit = (issue: Issue) => {
    setSelectedIssue(null);
    setEditIssue(issue);
    setShowModal(true);
  };

  const handleDetailEdit = (issue: Issue) => {
    setSelectedIssue(null);
    setEditIssue(issue);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditIssue(null);
  };

  const handleExportCsv = async () => {
    try {
      const { data: blobData } = await issuesApi.exportCsv(filters);
      const blob = blobData instanceof Blob ? blobData : new Blob([blobData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `issues-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed:', e);
    }
  };

  const clearFilters = () => {
    setFilterClusterId('');
    setFilterAssignee('');
    setFilterArea('');
    setFilterFrom('');
    setFilterTo('');
  };

  const hasFilters = filterClusterId || filterAssignee || filterArea || filterFrom || filterTo;

  const unresolvedCount = issues.filter((i) => !i.resolvedAt).length;
  const resolvedCount = issues.filter((i) => i.resolvedAt).length;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">이슈 관리 게시판</h1>
            {issues.length > 0 && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                  전체 {issues.length}
                </span>
                {unresolvedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    미조치 {unresolvedCount}
                  </span>
                )}
                {resolvedCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    조치완료 {resolvedCount}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
                }`}
                title="목록 보기"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-2 text-sm font-medium border-l border-border transition-colors flex items-center gap-1.5 ${
                  viewMode === 'kanban'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'
                }`}
                title="칸반 보기"
              >
                <Kanban className="w-4 h-4" />
              </button>
            </div>

            {viewMode === 'table' && (
              <button
                onClick={() => setShowDatetime((v) => !v)}
                className={`px-3 py-2 text-sm font-medium border rounded-lg transition-colors flex items-center gap-1.5 ${
                  showDatetime
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-secondary hover:bg-secondary/80 border-border text-muted-foreground hover:text-foreground'
                }`}
                title="발생일/조치일 시간 표시 on/off"
              >
                <Clock className="w-4 h-4" />
                시간 표시
              </button>
            )}
            {issues.length > 0 && viewMode === 'table' && (
              <button
                onClick={handleExportCsv}
                className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                CSV 추출
              </button>
            )}
            <button
              onClick={() => { setEditIssue(null); setShowModal(true); }}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              이슈 등록
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              placeholder="이슈 부분 검색"
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg"
            />

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="px-3 py-2 text-sm bg-background border border-border rounded-lg flex-1 min-w-0"
                title="발생일 시작"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="px-3 py-2 text-sm bg-background border border-border rounded-lg flex-1 min-w-0"
                title="발생일 종료"
              />
            </div>
          </div>
        </div>

        {/* Kanban view */}
        {viewMode === 'kanban' && (
          isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-64 rounded-xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <IssueKanban
              issues={sortedIssues}
              onIssueClick={setSelectedIssue}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )
        )}

        {/* Table */}
        {viewMode !== 'kanban' && (isLoading ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 border-b border-border last:border-b-0 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">
              {hasFilters ? '검색 조건에 해당하는 이슈가 없습니다.' : '등록된 이슈가 없습니다.'}
            </p>
            {!hasFilters && (
              <button
                onClick={() => { setEditIssue(null); setShowModal(true); }}
                className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + 첫 번째 이슈 등록
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
                    <SortTh label="상태" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="담당자" col="assignee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="대상 클러스터" col="clusterName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="이슈 부분" col="issueArea" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">이슈 내용</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">조치 내용</th>
                    <SortTh label="발생일" col="occurredAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="조치일" col="resolvedAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">비고</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => { if (e.over) dndHandleDragEnd(String(e.active.id), String(e.over.id)); }}>
                  <SortableContext items={sortedIssues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                  {sortedIssues.map((issue) => {
                    const isResolved = !!issue.resolvedAt;
                    const hasImages = hasLocalImages(issue.id);
                    return (
                      <SortableIssueRow key={issue.id} id={issue.id} isDragDisabled={!!sortKey}>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isResolved ? STATUS_DOT.resolved : STATUS_DOT.unresolved
                              }`}
                            />
                            <span
                              className={`text-xs font-medium ${
                                isResolved ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {isResolved ? '조치완료' : '미조치'}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap cursor-pointer" onClick={() => setSelectedIssue(issue)}>{issue.assignee}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          {issue.clusterName || '-'}
                        </td>
                        <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                            {issue.issueArea}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <div className="flex items-start gap-1.5">
                            <p className="line-clamp-2 text-foreground/90">{issue.issueContent}</p>
                            {hasImages && (
                              <span title="이미지 첨부 있음"><ImagePlus className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" /></span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-xs cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <p className="line-clamp-2 text-muted-foreground">
                            {issue.actionContent || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          {showDatetime ? formatDateTime(issue.occurredAt) : formatDate(issue.occurredAt)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono text-xs cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          {showDatetime ? formatDateTime(issue.resolvedAt) : formatDate(issue.resolvedAt)}
                        </td>
                        <td className="px-4 py-3 max-w-[120px] cursor-pointer" onClick={() => setSelectedIssue(issue)}>
                          <p className="line-clamp-2 text-muted-foreground text-xs">
                            {issue.remarks || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(issue); }}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                              title="수정"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(issue); }}
                              className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400"
                              title="삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </SortableIssueRow>
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

      <IssueModal
        isOpen={showModal}
        onClose={handleModalClose}
        onSubmit={editIssue ? handleUpdate : handleCreate}
        clusters={clusters}
        editIssue={editIssue}
      />

      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onEdit={handleDetailEdit}
        />
      )}
    </div>
  );
}
