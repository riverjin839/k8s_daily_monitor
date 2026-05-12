import { useState, useRef } from 'react';
import { GripVertical, Pencil, Trash2, ImagePlus, Plus, Check, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Issue, Cluster } from '@/types';
import { useUpdateIssue } from '@/hooks/useIssues';
import { ServiceChip } from '@/components/services/ServiceChip';
import { stripHtml } from '@/lib/utils';

const STATUS_DOT: Record<string, string> = {
  resolved: 'bg-emerald-500',
  unresolved: 'bg-amber-500',
};

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

type EditField =
  | null
  | 'primaryAssignee'
  | 'secondaryAssignee'
  | 'cluster'
  | 'issueArea'
  | 'issueContent'
  | 'actionContent'
  | 'occurredAt'
  | 'resolvedAt'
  | 'remarks';

interface IssueTableRowProps {
  issue: Issue;
  clusters: Cluster[];
  isDragDisabled: boolean;
  onEdit: (issue: Issue) => void;
  onDelete: (issue: Issue) => void;
}

/** 단일 클릭으로 진입하는 인라인 편집 셀. 더 이상 디테일 페이지로 이동하지 않음. */
function EditableCell({
  isEditing,
  onEnter,
  children,
  className = '',
  title = '클릭하여 수정',
}: {
  isEditing: boolean;
  onEnter: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  if (isEditing) {
    return <td className={`px-4 py-3 ${className}`}>{children}</td>;
  }
  return (
    <td
      className={`px-4 py-3 select-none cursor-pointer hover:bg-primary/5 transition-colors ${className}`}
      onClick={onEnter}
      title={title}
    >
      {children}
    </td>
  );
}

/** Enter 저장 / Esc 취소 / blur 저장 — 단일 라인 텍스트 입력. */
function TextInlineInput({
  initial,
  onSave,
  onCancel,
  placeholder,
  className = '',
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
  className?: string;
}) {
  const [val, setVal] = useState(initial);
  const committed = useRef(false);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = val.trim();
    if (trimmed === initial.trim()) {
      onCancel();
    } else {
      onSave(trimmed);
    }
  };

  return (
    <input
      autoFocus
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
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

/** 멀티라인 텍스트 편집 — 리치 텍스트 필드용 (이슈/조치 내용). 저장 시 평문으로 저장됨. */
function TextareaInline({
  initial,
  onSave,
  onCancel,
  placeholder,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [val, setVal] = useState(initial);
  const committed = useRef(false);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    if (val === initial) onCancel();
    else onSave(val);
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { committed.current = true; onCancel(); }
        }}
        placeholder={placeholder}
        rows={3}
        className="w-full px-2 py-1 text-sm bg-background border border-primary/40 rounded resize-y focus:outline-none focus:border-primary"
      />
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <button type="button" onClick={commit} className="p-0.5 text-primary hover:text-primary/80">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => { committed.current = true; onCancel(); }} className="p-0.5 hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
        <span className="ml-auto">Ctrl+Enter 저장 / Esc 취소 · 서식 보존이 필요하면 ✏️ 버튼 사용</span>
      </div>
    </div>
  );
}

export function IssueTableRow({ issue, clusters, isDragDisabled, onEdit, onDelete }: IssueTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: isDragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const updateIssue = useUpdateIssue();
  const [editing, setEditing] = useState<EditField>(null);

  const save = (patch: Partial<Issue>) => {
    updateIssue.mutate({ id: issue.id, data: patch }, { onSettled: () => setEditing(null) });
  };

  const isResolved = !!issue.resolvedAt;
  const hasImages = hasLocalImages(issue.id);

  // 상태 토글 — 미조치 ↔ 조치완료 (resolvedAt 세팅/해제).
  const toggleStatus = () => {
    if (isResolved) save({ resolvedAt: null });
    else save({ resolvedAt: todayDateInput() });
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-3 w-7">
        {!isDragDisabled && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded">
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </td>

      {/* 상태 — 클릭으로 토글 */}
      <td
        className="px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors select-none"
        onClick={toggleStatus}
        title={isResolved ? '클릭하여 미조치로 변경' : '클릭하여 조치완료로 변경 (오늘 날짜)'}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isResolved ? STATUS_DOT.resolved : STATUS_DOT.unresolved}`} />
          <span className={`text-xs font-medium ${isResolved ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isResolved ? '조치완료' : '미조치'}
          </span>
        </span>
      </td>

      {/* 담당자 — 정/부 칩 각각 클릭 가능 */}
      <td className="px-4 py-3 font-medium whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {editing === 'primaryAssignee' ? (
            <TextInlineInput
              initial={issue.primaryAssignee || issue.assignee || ''}
              onSave={(v) => save({ primaryAssignee: v, assignee: v })}
              onCancel={() => setEditing(null)}
              placeholder="정 담당자"
              className="text-[11px] w-32"
            />
          ) : (
            <span
              onClick={() => setEditing('primaryAssignee')}
              className="px-2 py-0.5 text-[11px] rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors"
              title="클릭하여 수정"
            >
              정: {issue.primaryAssignee || issue.assignee || '-'}
            </span>
          )}
          {editing === 'secondaryAssignee' ? (
            <TextInlineInput
              initial={issue.secondaryAssignee ?? ''}
              onSave={(v) => save({ secondaryAssignee: v || undefined })}
              onCancel={() => setEditing(null)}
              placeholder="부 담당자"
              className="text-[11px] w-32"
            />
          ) : issue.secondaryAssignee ? (
            <span
              onClick={() => setEditing('secondaryAssignee')}
              className="px-2 py-0.5 text-[11px] rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors"
              title="클릭하여 수정"
            >
              부: {issue.secondaryAssignee}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing('secondaryAssignee')}
              className="px-1.5 py-0.5 text-[10px] rounded-full border border-dashed border-border text-muted-foreground/60 hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-0.5"
              title="부 담당자 추가"
            >
              <Plus className="w-2.5 h-2.5" />부
            </button>
          )}
        </div>
      </td>

      {/* 클러스터 — select 인라인 */}
      <EditableCell
        isEditing={editing === 'cluster'}
        onEnter={() => setEditing('cluster')}
        className="text-muted-foreground whitespace-nowrap"
      >
        {editing === 'cluster' ? (
          <select
            autoFocus
            value={issue.clusterId ?? ''}
            onChange={(e) => {
              const id = e.target.value || undefined;
              const name = clusters.find((c) => c.id === id)?.name;
              save({ clusterId: id, clusterName: id ? name : undefined });
            }}
            onBlur={() => setEditing(null)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
            className="w-full px-2 py-1 text-sm bg-background border border-primary/40 rounded focus:outline-none focus:border-primary"
          >
            <option value="">—</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (issue.clusterName || '-')}
      </EditableCell>

      {/* 이슈 부분 */}
      <EditableCell
        isEditing={editing === 'issueArea'}
        onEnter={() => setEditing('issueArea')}
      >
        {editing === 'issueArea' ? (
          <TextInlineInput
            initial={issue.issueArea}
            onSave={(v) => save({ issueArea: v })}
            onCancel={() => setEditing(null)}
            placeholder="이슈 부분"
          />
        ) : (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
              {issue.issueArea}
            </span>
            {issue.service && <ServiceChip service={issue.service} />}
          </div>
        )}
      </EditableCell>

      {/* 이슈 내용 — 평문 textarea (서식 보존은 ✏️ 버튼) */}
      <EditableCell
        isEditing={editing === 'issueContent'}
        onEnter={() => setEditing('issueContent')}
        className="max-w-xs"
        title="클릭하여 수정 (서식 보존은 ✏️ 사용)"
      >
        {editing === 'issueContent' ? (
          <TextareaInline
            initial={stripHtml(issue.issueContent)}
            onSave={(v) => save({ issueContent: v })}
            onCancel={() => setEditing(null)}
            placeholder="이슈 내용"
          />
        ) : (
          <div className="flex items-start gap-1.5">
            <p className="line-clamp-2 text-foreground/90">{stripHtml(issue.issueContent)}</p>
            {hasImages && (
              <span title="이미지 첨부 있음"><ImagePlus className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" /></span>
            )}
          </div>
        )}
      </EditableCell>

      {/* 조치 내용 */}
      <EditableCell
        isEditing={editing === 'actionContent'}
        onEnter={() => setEditing('actionContent')}
        className="max-w-xs"
        title="클릭하여 수정 (서식 보존은 ✏️ 사용)"
      >
        {editing === 'actionContent' ? (
          <TextareaInline
            initial={stripHtml(issue.actionContent ?? '')}
            onSave={(v) => save({ actionContent: v || undefined })}
            onCancel={() => setEditing(null)}
            placeholder="조치 내용"
          />
        ) : (
          <p className="line-clamp-2 text-muted-foreground">
            {stripHtml(issue.actionContent) || '-'}
          </p>
        )}
      </EditableCell>

      {/* 발생일 */}
      <EditableCell
        isEditing={editing === 'occurredAt'}
        onEnter={() => setEditing('occurredAt')}
        className="text-muted-foreground whitespace-nowrap font-mono text-xs"
      >
        {editing === 'occurredAt' ? (
          <input
            autoFocus
            type="date"
            defaultValue={toDateInput(issue.occurredAt)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && v !== toDateInput(issue.occurredAt)) save({ occurredAt: v });
              else setEditing(null);
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
            className="px-2 py-1 text-xs bg-background border border-primary/40 rounded focus:outline-none focus:border-primary"
          />
        ) : formatDateTime(issue.occurredAt)}
      </EditableCell>

      {/* 조치일 */}
      <EditableCell
        isEditing={editing === 'resolvedAt'}
        onEnter={() => setEditing('resolvedAt')}
        className="text-muted-foreground whitespace-nowrap font-mono text-xs"
      >
        {editing === 'resolvedAt' ? (
          <input
            autoFocus
            type="date"
            defaultValue={toDateInput(issue.resolvedAt)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== toDateInput(issue.resolvedAt)) save({ resolvedAt: v || null });
              else setEditing(null);
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
            className="px-2 py-1 text-xs bg-background border border-primary/40 rounded focus:outline-none focus:border-primary"
          />
        ) : formatDateTime(issue.resolvedAt)}
      </EditableCell>

      {/* 비고 */}
      <EditableCell
        isEditing={editing === 'remarks'}
        onEnter={() => setEditing('remarks')}
        className="max-w-[120px]"
      >
        {editing === 'remarks' ? (
          <TextInlineInput
            initial={issue.remarks ?? ''}
            onSave={(v) => save({ remarks: v || undefined })}
            onCancel={() => setEditing(null)}
            placeholder="비고"
            className="text-xs"
          />
        ) : (
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {issue.remarks || '-'}
          </p>
        )}
      </EditableCell>

      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(issue); }}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
            title="전체 수정 (리치 텍스트 / 이미지 포함)"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(issue); }}
            className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
