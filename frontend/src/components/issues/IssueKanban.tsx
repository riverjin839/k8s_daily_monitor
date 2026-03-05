import { Pencil, Trash2, CalendarDays, User, Server } from 'lucide-react';
import type { Issue } from '@/types';

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function formatDate(s?: string | null) {
  if (!s) return '-';
  return s.slice(0, 10);
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

// ── 컬럼 설정 ──────────────────────────────────────────────────────────────────
const COLUMNS: {
  key: 'unresolved' | 'resolved';
  label: string;
  headerCls: string;
  dotCls: string;
  emptyText: string;
}[] = [
  {
    key: 'unresolved',
    label: '미해결',
    headerCls: 'border-amber-500/40 bg-amber-500/5',
    dotCls: 'bg-amber-400',
    emptyText: '미해결 이슈가 없습니다',
  },
  {
    key: 'resolved',
    label: '해결',
    headerCls: 'border-emerald-500/40 bg-emerald-500/5',
    dotCls: 'bg-emerald-400',
    emptyText: '해결된 이슈가 없습니다',
  },
];

// ── 카드 ───────────────────────────────────────────────────────────────────────
interface IssueCardProps {
  issue: Issue;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function IssueCard({ issue, onClick, onEdit, onDelete }: IssueCardProps) {
  return (
    <div
      className="bg-card border border-border rounded-lg p-3 group hover:border-primary/30 transition-colors cursor-pointer shadow-sm"
      onClick={onClick}
    >
      {/* 이슈 부분 배지 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {issue.issueArea}
        </span>
      </div>

      {/* 내용 */}
      <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed mb-2">
        {issue.issueContent}
      </p>

      {/* 조치 내용 */}
      {issue.actionContent && (
        <p className="text-[10px] text-muted-foreground line-clamp-1 mb-2 bg-muted/30 rounded px-1.5 py-0.5">
          → {issue.actionContent}
        </p>
      )}

      {/* 메타 */}
      <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="w-3 h-3 flex-shrink-0" />
          {issue.assignee}
          {issue.clusterName && (
            <>
              <Server className="w-3 h-3 flex-shrink-0 ml-1" />
              {issue.clusterName}
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          발생: {formatDate(issue.occurredAt)}
          {issue.resolvedAt && (
            <span className="ml-1">→ 조치: {formatDate(issue.resolvedAt)}</span>
          )}
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
interface IssueKanbanProps {
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
  onEdit: (issue: Issue) => void;
  onDelete: (issue: Issue) => void;
}

export function IssueKanban({ issues, onIssueClick, onEdit, onDelete }: IssueKanbanProps) {
  const grouped = {
    unresolved: sortIssues(issues.filter((i) => !i.resolvedAt)),
    resolved:   sortIssues(issues.filter((i) => !!i.resolvedAt)),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {COLUMNS.map((col) => {
        const colIssues = grouped[col.key];
        return (
          <div key={col.key} className="flex flex-col min-h-[300px]">
            {/* Column header */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border ${col.headerCls}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${col.dotCls}`} />
              <span className="text-sm font-semibold">{col.label}</span>
              <span className="ml-auto text-xs text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">
                {colIssues.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 bg-muted/10 border border-t-0 border-border rounded-b-lg p-2 flex flex-col gap-2 min-h-[200px]">
              {colIssues.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground/50 text-center py-4">{col.emptyText}</p>
                </div>
              ) : (
                colIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onClick={() => onIssueClick(issue)}
                    onEdit={() => onEdit(issue)}
                    onDelete={() => onDelete(issue)}
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
