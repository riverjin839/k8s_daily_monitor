import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClusterSidebar, ResizeGrip, ViewModeBar } from '@/components/common';
import { Plus, Download, ClipboardList, Search, X, ChevronUp, ChevronDown, ArrowUpDown, Kanban, List } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IssueKanban, IssueTableRow } from '@/components/issues';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useIssues, useDeleteIssue } from '@/hooks/useIssues';
import { useLocalOrder } from '@/hooks/useLocalOrder';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { issuesApi } from '@/services/api';
import { Issue } from '@/types';

type IssueSortKey = 'status' | 'assignee' | 'clusterName' | 'issueArea' | 'occurredAt' | 'resolvedAt';

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  onResizeMouseDown,
  onResizeDoubleClick,
}: {
  label: string;
  col: IssueSortKey;
  sortKey: IssueSortKey | '';
  sortDir: 'asc' | 'desc';
  onSort: (col: IssueSortKey) => void;
  className?: string;
  onResizeMouseDown?: (e: React.MouseEvent) => void;
  onResizeDoubleClick?: () => void;
}) {
  const isActive = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`relative px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground transition-colors ${className ?? ''}`}
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
      {onResizeMouseDown && <ResizeGrip onMouseDown={onResizeMouseDown} onDoubleClick={onResizeDoubleClick} />}
    </th>
  );
}

export function IssueBoardPage() {
  const navigate = useNavigate();
  const [filterClusterId, setFilterClusterId] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortKey, setSortKey] = useState<IssueSortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  const colW = useColumnWidths('issue-board-table', {
    defaults: {
      drag: 28, status: 100, assignee: 200, cluster: 140, area: 120,
      issueContent: 280, actionContent: 280,
      occurredAt: 130, resolvedAt: 130, remarks: 160, actions: 110,
    },
    min: 60, max: 800,
  });

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

  const deleteIssue = useDeleteIssue();

  const handleDelete = (issue: Issue) => {
    if (!confirm(`"${issue.issueArea}" 이슈를 삭제하시겠습니까?`)) return;
    deleteIssue.mutate(issue.id);
    localStorage.removeItem('k8s:img:issue:' + issue.id);
  };

  // 행 / 칸반의 ✏️ 버튼 — 수정 라우트로 진입.
  const handleEdit = (issue: Issue) => {
    navigate(`/issues/${issue.id}/edit`);
  };

  // 칸반 카드 / 상세 보기 — 인라인 편집으로 처리 불가능한 경우(리치 텍스트 전체보기 등)
  // 에 한해 디테일 라우트로 진입.
  const openIssueDetail = (issue: Issue) => {
    navigate(`/issues/${issue.id}`);
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
      <main className="mx-auto px-4 lg:px-6 py-6 flex gap-3">
        <ClusterSidebar
          clusters={clusters}
          selectedId={filterClusterId || null}
          onSelect={(id) => setFilterClusterId(id ?? '')}
          allowAll
          allLabel="전체 이슈"
          title="클러스터"
        />
        <div className="flex-1 min-w-0">
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
            <ViewModeBar
              modes={[
                { id: 'table',  label: '목록', icon: <List   className="w-3.5 h-3.5" /> },
                { id: 'kanban', label: '칸반', icon: <Kanban className="w-3.5 h-3.5" /> },
              ]}
              active={viewMode}
              onChange={(v) => setViewMode(v as 'table' | 'kanban')}
              showStylePanel={false}
            />

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
              onClick={() => navigate('/issues/new')}
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
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
              onIssueClick={openIssueDetail}
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
                onClick={() => navigate('/issues/new')}
                className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
              >
                + 첫 번째 이슈 등록
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
                <colgroup>
                  {(['drag', 'status', 'assignee', 'cluster', 'area', 'issueContent', 'actionContent', 'occurredAt', 'resolvedAt', 'remarks', 'actions'] as const).map((k) => (
                    <col key={k} style={{ width: `${colW.getWidth(k)}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th />
                    <SortTh label="상태" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('status', e)} onResizeDoubleClick={() => colW.autoFit('status')} />
                    <SortTh label="담당자(정/부)" col="assignee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('assignee', e)} onResizeDoubleClick={() => colW.autoFit('assignee')} />
                    <SortTh label="대상 클러스터" col="clusterName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('cluster', e)} onResizeDoubleClick={() => colW.autoFit('cluster')} />
                    <SortTh label="이슈 부분" col="issueArea" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('area', e)} onResizeDoubleClick={() => colW.autoFit('area')} />
                    <th className="relative px-4 py-3 text-left font-medium text-muted-foreground">이슈 내용
                      <ResizeGrip onMouseDown={(e) => colW.beginResize('issueContent', e)} onDoubleClick={() => colW.autoFit('issueContent')} />
                    </th>
                    <th className="relative px-4 py-3 text-left font-medium text-muted-foreground">조치 내용
                      <ResizeGrip onMouseDown={(e) => colW.beginResize('actionContent', e)} onDoubleClick={() => colW.autoFit('actionContent')} />
                    </th>
                    <SortTh label="발생일" col="occurredAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('occurredAt', e)} onResizeDoubleClick={() => colW.autoFit('occurredAt')} />
                    <SortTh label="조치일" col="resolvedAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                      onResizeMouseDown={(e) => colW.beginResize('resolvedAt', e)} onResizeDoubleClick={() => colW.autoFit('resolvedAt')} />
                    <th className="relative px-4 py-3 text-left font-medium text-muted-foreground">비고
                      <ResizeGrip onMouseDown={(e) => colW.beginResize('remarks', e)} onDoubleClick={() => colW.autoFit('remarks')} />
                    </th>
                    <th className="relative px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업
                      <ResizeGrip onMouseDown={(e) => colW.beginResize('actions', e)} onDoubleClick={() => colW.autoFit('actions')} />
                    </th>
                  </tr>
                </thead>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => { if (e.over) dndHandleDragEnd(String(e.active.id), String(e.over.id)); }}>
                  <SortableContext items={sortedIssues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                  {sortedIssues.map((issue) => (
                    <IssueTableRow
                      key={issue.id}
                      issue={issue}
                      clusters={clusters}
                      isDragDisabled={!!sortKey}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
                </SortableContext>
                </DndContext>
              </table>
            </div>
          </div>
        ))}
        </div>
      </main>

    </div>
  );
}
