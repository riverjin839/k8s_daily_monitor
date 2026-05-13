import { useRef, useState } from 'react';
import {
  Play, Trash2, Loader2, LayoutDashboard, Pencil, GripVertical,
  ChevronUp, ChevronDown, ArrowUpDown,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Playbook } from '@/types';
import { useUpdatePlaybook } from '@/hooks/usePlaybook';

type PlaybookSortKey = 'name' | 'status' | 'lastRunAt';

interface StatusMeta {
  color: string;
  bg: string;
  label: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  healthy:  { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', label: 'OK' },
  warning:  { color: 'text-amber-400',   bg: 'bg-amber-500/15   border-amber-500/30',   label: 'Changed' },
  critical: { color: 'text-red-400',     bg: 'bg-red-500/15     border-red-500/30',     label: 'Failed' },
  running:  { color: 'text-blue-400',    bg: 'bg-blue-500/15    border-blue-500/30',    label: 'Running' },
  unknown:  { color: 'text-gray-400',    bg: 'bg-gray-500/15    border-gray-500/30',    label: 'Not Run' },
};

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface PlaybookTableProps {
  playbooks: Playbook[];
  runningIds: Set<string>;
  sortKey: PlaybookSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: PlaybookSortKey) => void;
  onRun: (pb: Playbook) => void;
  onEdit: (pb: Playbook) => void;
  onDelete: (pb: Playbook) => void;
  onToggleDashboard: (pb: Playbook) => void;
  onReorder: (activeId: string, overId: string) => void;
}

function SortTh({
  label, col, sortKey, sortDir, onSort, className,
}: {
  label: string;
  col: PlaybookSortKey;
  sortKey: PlaybookSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: PlaybookSortKey) => void;
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
          sortDir === 'asc'
            ? <ChevronUp   className="w-3 h-3 text-primary" />
            : <ChevronDown className="w-3 h-3 text-primary" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </span>
    </th>
  );
}

function SourceCell({ playbook }: { playbook: Playbook }) {
  if (playbook.playbookFileName) {
    return (
      <div className="text-xs font-mono">
        <div className="truncate text-foreground/80">📄 {playbook.playbookFileName}</div>
        {playbook.inventoryName && (
          <div className="truncate text-muted-foreground/80">📋 {playbook.inventoryName}</div>
        )}
      </div>
    );
  }
  if (playbook.playbookPath) {
    return <div className="text-xs font-mono truncate text-muted-foreground">{playbook.playbookPath}</div>;
  }
  return <span className="text-xs italic text-muted-foreground/70">(no source)</span>;
}

function StatsCell({ playbook }: { playbook: Playbook }) {
  const totals = playbook.lastResult?.stats?.totals as
    | { ok: number; changed: number; failures: number; unreachable: number; skipped: number }
    | undefined;
  if (!totals) return <span className="text-xs text-muted-foreground/50">-</span>;
  const items: Array<{ label: string; value: number; color: string }> = [
    { label: 'OK',   value: totals.ok ?? 0,          color: 'text-emerald-400' },
    { label: 'Chg',  value: totals.changed ?? 0,     color: 'text-amber-400' },
    { label: 'Fail', value: totals.failures ?? 0,    color: 'text-red-400' },
    { label: 'Unr',  value: totals.unreachable ?? 0, color: 'text-orange-400' },
    { label: 'Skip', value: totals.skipped ?? 0,     color: 'text-gray-400' },
  ];
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      {items.map((it) => (
        <span key={it.label} className={it.value > 0 ? it.color : 'text-muted-foreground/40'}>
          <span className="font-semibold">{it.value}</span>
          <span className="ml-0.5 text-[10px] text-muted-foreground/70">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

function InlineRowText({
  initial, onSave, onCancel, placeholder, className = '',
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
}) {
  const [v, setV] = useState(initial);
  const committed = useRef(false);
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const t = v.trim();
    if (t === initial.trim()) onCancel();
    else onSave(t);
  };
  return (
    <input
      autoFocus
      type="text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { committed.current = true; onCancel(); }
      }}
      onBlur={commit}
      placeholder={placeholder}
      className={`w-full px-2 py-1 text-sm bg-background border border-primary/40 rounded focus:outline-none focus:border-primary ${className}`}
    />
  );
}

function SortableRow({
  playbook, isRunning, onRun, onEdit, onDelete, onToggleDashboard,
}: {
  playbook: Playbook;
  isRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDashboard: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: playbook.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const effectiveStatus = isRunning ? 'running' : (playbook.status ?? 'unknown');
  const meta = STATUS_META[effectiveStatus] ?? STATUS_META.unknown;
  const result = playbook.lastResult;

  const updatePlaybook = useUpdatePlaybook();
  const [editing, setEditing] = useState<null | 'name' | 'description' | 'tags'>(null);
  const save = (patch: Partial<Playbook>) =>
    updatePlaybook.mutate({ id: playbook.id, data: patch }, { onSettled: () => setEditing(null) });

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-3 w-7">
        <button
          {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded"
          title="드래그하여 순서 변경"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          {editing === 'name' ? (
            <InlineRowText
              initial={playbook.name}
              onSave={(v) => v ? save({ name: v }) : setEditing(null)}
              onCancel={() => setEditing(null)}
              placeholder="이름"
            />
          ) : (
            <p
              className="font-semibold text-sm truncate cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditing('name')}
              title="클릭하여 이름 수정"
            >
              {playbook.name}
            </p>
          )}
          {editing === 'description' ? (
            <InlineRowText
              initial={playbook.description ?? ''}
              onSave={(v) => save({ description: v || undefined })}
              onCancel={() => setEditing(null)}
              placeholder="설명"
              className="text-xs"
            />
          ) : playbook.description ? (
            <p
              className="text-xs text-muted-foreground truncate mt-0.5 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setEditing('description')}
              title="클릭하여 설명 수정"
            >
              {playbook.description}
            </p>
          ) : (
            <p
              className="text-xs text-muted-foreground/50 italic mt-0.5 cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditing('description')}
            >
              + 설명 추가
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color}`}>
          {isRunning && <Loader2 className="w-3 h-3 animate-spin" />}
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 max-w-xs">
        <SourceCell playbook={playbook} />
      </td>
      <td className="px-4 py-3">
        <StatsCell playbook={playbook} />
        {result?.message && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{String(result.message)}</p>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs font-mono">
        {formatTimeAgo(playbook.lastRunAt)}
        {result?.durationMs != null && (
          <span className="ml-1 text-muted-foreground/60">({Number(result.durationMs)}ms)</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={onToggleDashboard}
            className={`p-1.5 rounded-md transition-colors ${
              playbook.showOnDashboard
                ? 'bg-primary/15 text-primary'
                : 'hover:bg-primary/10 text-muted-foreground'
            }`}
            title={playbook.showOnDashboard ? '대시보드에서 제거' : '대시보드에 추가'}
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>
          <button
            onClick={onRun}
            disabled={isRunning}
            className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
            title="실행"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={onEdit}
            disabled={isRunning}
            className="p-1.5 rounded-md hover:bg-primary/10 text-primary transition-colors disabled:opacity-50"
            title="수정"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isRunning}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400 transition-colors disabled:opacity-50"
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function PlaybookTable({
  playbooks, runningIds, sortKey, sortDir, onSort,
  onRun, onEdit, onDelete, onToggleDashboard, onReorder,
}: PlaybookTableProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="w-7" />
              <SortTh label="이름"    col="name"       sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="상태"    col="status"     sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">출처</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">최근 결과</th>
              <SortTh label="최근 실행" col="lastRunAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => { if (e.over) onReorder(String(e.active.id), String(e.over.id)); }}
          >
            <SortableContext items={playbooks.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {playbooks.map((pb) => (
                  <SortableRow
                    key={pb.id}
                    playbook={pb}
                    isRunning={runningIds.has(pb.id)}
                    onRun={() => onRun(pb)}
                    onEdit={() => onEdit(pb)}
                    onDelete={() => onDelete(pb)}
                    onToggleDashboard={() => onToggleDashboard(pb)}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>
    </div>
  );
}
