import { useState } from 'react';
import { Server, CheckCircle, AlertTriangle, XCircle, WifiOff, LayoutGrid, GripVertical, ArrowDownUp } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Cluster, Status } from '@/types';
import { useSidebarStore } from '@/stores/sidebarStore';
import { ResizeHandle } from './ResizeHandle';

interface ClusterSidebarProps {
  clusters: Cluster[];
  /** 현재 선택 — null 이면 전체(All), 문자열이면 해당 cluster.id */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  title?: string;
  /** 지금 선택된 클러스터가 상단 고정 (풀 배경) */
  highlightActive?: boolean;
  /** 최상단에 "전체" 선택지 (Dashboard 에 유용) */
  allowAll?: boolean;
  /** "전체" 표시 라벨 */
  allLabel?: string;
  /** 정렬 모드 토글 + 드래그 앤 드랍 활성화. onReorder 가 주어지면 기능 노출. */
  onReorder?: (orderedClusterIds: string[]) => void;
  /** 다중 선택 모드 — 활성화 시 selectedIds/onMultiSelectChange 가 우선한다.
   *  noop pages 영향 없음: 기본 false. */
  multiSelect?: boolean;
  /** multiSelect 모드일 때 현재 선택된 클러스터 id 들 */
  selectedIds?: string[];
  /** multiSelect 모드일 때 선택 변경 콜백 */
  onMultiSelectChange?: (ids: string[]) => void;
}

const STATUS_ICON: Record<Status, React.ComponentType<{ className?: string }>> = {
  healthy: CheckCircle,
  warning: AlertTriangle,
  critical: XCircle,
  pending: WifiOff,
};

const STATUS_DOT: Record<Status, string> = {
  healthy:  'bg-emerald-500',
  warning:  'bg-amber-500',
  critical: 'bg-red-500',
  pending:  'bg-slate-400',
};

interface RowProps {
  cluster: Cluster;
  active: boolean;
  sortMode: boolean;
  onSelect: () => void;
  /** 다중 선택 모드 — true 면 좌측에 체크박스 노출 */
  multiSelect?: boolean;
  checked?: boolean;
}

function ClusterRow({ cluster, active, sortMode, onSelect, multiSelect, checked }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cluster.id,
    disabled: !sortMode,
  });
  const Icon = STATUS_ICON[cluster.status] ?? Server;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`group flex items-center gap-1.5 rounded-lg transition-colors ${
        active && !sortMode
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'hover:bg-secondary text-foreground border border-transparent'
      }`}
    >
      {sortMode && (
        <button
          {...attributes}
          {...listeners}
          className="px-1 py-1.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          aria-label="드래그하여 순서 변경"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}
      {multiSelect && !sortMode && (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onSelect}
          aria-label={`${cluster.name} 선택`}
          className="ml-2 w-4 h-4 accent-primary flex-shrink-0"
        />
      )}
      <button
        onClick={sortMode ? undefined : onSelect}
        disabled={sortMode}
        className={`flex-1 flex items-center gap-2 ${sortMode ? 'pl-1' : 'pl-2'} pr-2 py-1.5 text-left min-w-0 disabled:cursor-default`}
      >
        <span className="text-[10px] font-mono text-muted-foreground/70 w-7 text-right tabular-nums flex-shrink-0">
          #{cluster.seq ?? '-'}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[cluster.status] ?? 'bg-slate-400'}`} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{cluster.name}</span>
          {(cluster.region || cluster.operationLevel) && (
            <span className="block text-[11px] text-muted-foreground truncate">
              {cluster.region}{cluster.region && cluster.operationLevel ? ' · ' : ''}{cluster.operationLevel}
            </span>
          )}
        </span>
        {!sortMode && (
          <Icon className={`w-3 h-3 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/70'}`} />
        )}
      </button>
    </div>
  );
}

/** 좌측 클러스터 선택 사이드바 — 드래그로 폭 조절 가능.
 *  부모가 flex row 레이아웃을 잡아주면, 이 컴포넌트는 자기 폭을 가짐.
 *  onReorder 가 주어지면 정렬 모드 토글 버튼이 노출되고, 모드에서 드래그로 seq 를 재할당한다.
 */
export function ClusterSidebar({
  clusters, selectedId, onSelect, title = '클러스터',
  highlightActive = true, allowAll = false, allLabel = '전체 클러스터',
  onReorder,
  multiSelect = false, selectedIds, onMultiSelectChange,
}: ClusterSidebarProps) {
  const selectedSet = multiSelect ? new Set(selectedIds ?? []) : null;
  const toggleMulti = (id: string) => {
    if (!multiSelect || !onMultiSelectChange) return;
    const next = new Set(selectedSet ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // 클러스터 정렬 순서를 유지하기 위해 원본 배열 순서로 정렬해서 내려준다.
    const ordered = clusters.map((c) => c.id).filter((cid) => next.has(cid));
    onMultiSelectChange(ordered);
  };
  const toggleAllMulti = () => {
    if (!multiSelect || !onMultiSelectChange) return;
    const all = clusters.map((c) => c.id);
    if ((selectedSet?.size ?? 0) === all.length) onMultiSelectChange([]);
    else onMultiSelectChange(all);
  };
  const width = useSidebarStore((s) => s.clusterSidebarWidth);
  const setWidth = useSidebarStore((s) => s.setClusterSidebarWidth);
  const reset = useSidebarStore((s) => s.resetClusterSidebar);
  const totalN = clusters.length;
  const [sortMode, setSortMode] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = clusters.findIndex((c) => c.id === active.id);
    const newIndex = clusters.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(clusters, oldIndex, newIndex);
    onReorder(reordered.map((c) => c.id));
  };

  return (
    <aside
      style={{ width }}
      className="flex-shrink-0 bg-card border border-border rounded-xl p-2 h-fit sticky top-4 relative"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
          <span className="ml-1 text-muted-foreground/70">
            {multiSelect ? `(${selectedSet?.size ?? 0}/${totalN})` : `(${totalN})`}
          </span>
        </p>
        {multiSelect && !sortMode && totalN > 0 && (
          <button
            onClick={toggleAllMulti}
            className="text-[10px] text-primary hover:text-primary/80"
          >
            {(selectedSet?.size ?? 0) === totalN ? '전체 해제' : '전체 선택'}
          </button>
        )}
        {onReorder && (
          <button
            onClick={() => setSortMode((v) => !v)}
            className={`p-1 rounded text-[10px] inline-flex items-center gap-1 ${
              sortMode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={sortMode ? '정렬 모드 종료' : '드래그로 순서 변경'}
          >
            <ArrowDownUp className="w-3 h-3" />
            {sortMode && <span>완료</span>}
          </button>
        )}
      </div>

      {allowAll && !sortMode && !multiSelect && (
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors mb-0.5 ${
            selectedId === null && highlightActive
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'hover:bg-secondary text-foreground border border-transparent'
          }`}
        >
          <LayoutGrid className={`w-3.5 h-3.5 flex-shrink-0 ${selectedId === null ? 'text-primary' : 'text-muted-foreground/70'}`} />
          <span className="flex-1 min-w-0 text-sm font-medium truncate">{allLabel}</span>
          {totalN > 0 && (
            <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">{totalN}</span>
          )}
        </button>
      )}

      <div className="space-y-0.5">
        {clusters.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground/70">등록된 클러스터 없음</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={clusters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {clusters.map((c) => (
                <ClusterRow
                  key={c.id}
                  cluster={c}
                  active={multiSelect
                    ? !!selectedSet?.has(c.id)
                    : highlightActive && c.id === selectedId}
                  sortMode={sortMode}
                  onSelect={multiSelect ? () => toggleMulti(c.id) : () => onSelect(c.id)}
                  multiSelect={multiSelect}
                  checked={multiSelect ? selectedSet?.has(c.id) : undefined}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ResizeHandle width={width} onResize={setWidth} onReset={reset} />
    </aside>
  );
}
