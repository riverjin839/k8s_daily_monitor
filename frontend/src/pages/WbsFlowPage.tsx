import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tasksApi, issuesApi } from '@/services/api';
import type { Task, Issue } from '@/types';
import {
  ChevronLeft, ChevronRight, Calendar, Users, Filter,
  CheckCircle2, Clock, AlertCircle, Circle, BarChart3,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}
const KR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}(${KR_DAYS[d.getDay()]})`;
}
function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

const KANBAN_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'Todo', in_progress: '진행중',
  review_test: '검토', done: '완료',
};
const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};
const MODULE_COLOR: Record<string, string> = {
  k8s: 'bg-blue-500/20 text-blue-400',
  keycloak: 'bg-purple-500/20 text-purple-400',
  nexus: 'bg-orange-500/20 text-orange-400',
  cilium: 'bg-cyan-500/20 text-cyan-400',
  argocd: 'bg-green-500/20 text-green-400',
  jenkins: 'bg-red-500/20 text-red-400',
  backend: 'bg-indigo-500/20 text-indigo-400',
  frontend: 'bg-pink-500/20 text-pink-400',
  monitoring: 'bg-teal-500/20 text-teal-400',
  infra: 'bg-slate-500/20 text-slate-400',
};

// ── types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'week' | 'twoWeek' | 'month';

interface DayItem {
  type: 'task' | 'issue';
  id: string;
  label: string;
  sub?: string;
  status: string;
  priority?: string;
  module?: string;
  startDate: string;
  endDate?: string;
  resolved?: boolean;
}

interface AssigneeRow {
  assignee: string;
  roles: string[];        // modules/areas
  items: Map<string, DayItem[]>; // date → items
}

// ── small components ──────────────────────────────────────────────────────────

function StatusIcon({ status, type }: { status: string; type: 'task' | 'issue' }) {
  if (type === 'issue') {
    return status === 'resolved'
      ? <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
      : <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />;
  }
  const icons: Record<string, JSX.Element> = {
    done: <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />,
    in_progress: <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />,
    review_test: <Clock className="w-3 h-3 text-yellow-400 flex-shrink-0" />,
    todo: <Circle className="w-3 h-3 text-gray-400 flex-shrink-0" />,
    backlog: <Circle className="w-3 h-3 text-gray-500 flex-shrink-0" />,
  };
  return icons[status] ?? <Circle className="w-3 h-3 text-gray-400 flex-shrink-0" />;
}

function ItemCard({ item, onClick }: { item: DayItem; onClick: () => void }) {
  const isIssue = item.type === 'issue';
  const base = isIssue
    ? (item.resolved ? 'border-l-green-500 bg-green-500/5' : 'border-l-orange-500 bg-orange-500/5')
    : `border-l-blue-500 bg-blue-500/5`;

  return (
    <div
      onClick={onClick}
      className={`border-l-2 ${base} rounded-r px-2 py-1 cursor-pointer hover:opacity-80 transition-opacity text-left`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <StatusIcon status={isIssue ? (item.resolved ? 'resolved' : 'open') : item.status} type={item.type} />
        <span className="text-[11px] font-medium truncate leading-tight">{item.label}</span>
      </div>
      {item.sub && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight pl-4">{item.sub}</p>
      )}
      <div className="flex items-center gap-1 mt-0.5 pl-4 flex-wrap">
        {item.module && (
          <span className={`text-[9px] px-1 rounded ${MODULE_COLOR[item.module] ?? 'bg-secondary text-muted-foreground'}`}>
            {item.module}
          </span>
        )}
        {item.priority && (
          <span className={`text-[9px] px-1 rounded border ${PRIORITY_COLOR[item.priority] ?? ''}`}>
            {item.priority}
          </span>
        )}
        {isIssue && (
          <span className={`text-[9px] px-1 rounded ${item.resolved ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
            {item.resolved ? '해결' : '미해결'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ item, onClose }: { item: DayItem; onClose: () => void }) {
  const isIssue = item.type === 'issue';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-md shadow-xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isIssue ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {isIssue ? '이슈' : '작업'}
            </span>
            {item.module && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${MODULE_COLOR[item.module] ?? 'bg-secondary text-muted-foreground'}`}>
                {item.module}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <h3 className="text-sm font-semibold mb-1">{item.label}</h3>
        {item.sub && <p className="text-sm text-muted-foreground mb-3">{item.sub}</p>}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div><span className="font-medium">시작일:</span> {item.startDate}</div>
          {item.endDate && <div><span className="font-medium">완료일:</span> {item.endDate}</div>}
          {item.priority && <div><span className="font-medium">우선순위:</span> {item.priority}</div>}
          <div>
            <span className="font-medium">상태:</span>{' '}
            {isIssue ? (item.resolved ? '해결' : '미해결') : (KANBAN_LABEL[item.status] ?? item.status)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ tasks, issues }: { tasks: Task[]; issues: Issue[] }) {
  const taskCounts = useMemo(() => {
    const c = { total: tasks.length, done: 0, in_progress: 0, todo: 0, backlog: 0 };
    for (const t of tasks) {
      if (t.kanbanStatus === 'done') c.done++;
      else if (t.kanbanStatus === 'in_progress') c.in_progress++;
      else if (t.kanbanStatus === 'todo') c.todo++;
      else c.backlog++;
    }
    return c;
  }, [tasks]);

  const issueCounts = useMemo(() => ({
    total: issues.length,
    resolved: issues.filter(i => i.resolvedAt).length,
    open: issues.filter(i => !i.resolvedAt).length,
  }), [issues]);

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <BarChart3 className="w-3.5 h-3.5" />
        <span className="font-medium">요약</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">작업 {taskCounts.total}건</span>
        <span className="text-green-400">완료 {taskCounts.done}</span>
        <span className="text-blue-400">진행중 {taskCounts.in_progress}</span>
        <span className="text-gray-400">대기 {taskCounts.todo + taskCounts.backlog}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">이슈 {issueCounts.total}건</span>
        <span className="text-green-400">해결 {issueCounts.resolved}</span>
        <span className="text-red-400">미해결 {issueCounts.open}</span>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function WbsFlowPage() {
  const today = new Date();
  const [baseDate, setBaseDate] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay()); // start of current week (Sunday)
    return d;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('twoWeek');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [selectedItem, setSelectedItem] = useState<DayItem | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  // ── data fetching ──
  const { data: taskRes } = useQuery({
    queryKey: ['wbs-tasks'],
    queryFn: () => tasksApi.getAll().then(r => r.data.data),
  });
  const { data: issueRes } = useQuery({
    queryKey: ['wbs-issues'],
    queryFn: () => issuesApi.getAll().then(r => r.data.data),
  });
  const tasks: Task[] = useMemo(() => taskRes ?? [], [taskRes]);
  const issues: Issue[] = useMemo(() => issueRes ?? [], [issueRes]);

  // ── date range ──
  const dayCount = viewMode === 'week' ? 7 : viewMode === 'twoWeek' ? 14 : 30;
  const dates = useMemo(() => {
    return Array.from({ length: dayCount }, (_, i) => addDays(baseDate, i));
  }, [baseDate, dayCount]);

  const todayStr = fmtDate(today);
  const startStr = fmtDate(baseDate);
  const endStr = fmtDate(addDays(baseDate, dayCount - 1));

  const movePrev = () => setBaseDate(d => addDays(d, -dayCount));
  const moveNext = () => setBaseDate(d => addDays(d, dayCount));
  const moveToday = () => {
    const d = new Date(today);
    if (viewMode !== 'month') d.setDate(d.getDate() - d.getDay());
    setBaseDate(d);
  };

  // ── build assignee rows ──
  const rows: AssigneeRow[] = useMemo(() => {
    const map = new Map<string, AssigneeRow>();
    const ensureRow = (assignee: string) => {
      if (!map.has(assignee)) {
        map.set(assignee, { assignee, roles: [], items: new Map() });
      }
      return map.get(assignee)!;
    };
    const addItem = (assignee: string, date: string, item: DayItem) => {
      const row = ensureRow(assignee);
      if (!row.items.has(date)) row.items.set(date, []);
      row.items.get(date)!.push(item);
    };

    for (const task of tasks) {
      const assignee = task.assignee || '미지정';
      const row = ensureRow(assignee);
      if (task.module && !row.roles.includes(task.module)) row.roles.push(task.module);

      const startD = task.scheduledAt ? parseDate(task.scheduledAt) : null;
      const endD = task.completedAt ? parseDate(task.completedAt) : null;
      if (!startD) continue;

      const item: DayItem = {
        type: 'task',
        id: task.id,
        label: task.taskContent,
        sub: task.taskCategory,
        status: task.kanbanStatus,
        priority: task.priority,
        module: task.module,
        startDate: fmtDate(startD),
        endDate: endD ? fmtDate(endD) : undefined,
      };

      // Place item on all dates in its range (within view)
      const effectiveEnd = endD ?? startD;
      const rangeStart = startD < parseDate(startStr) ? parseDate(startStr) : startD;
      const rangeEnd = effectiveEnd > parseDate(endStr) ? parseDate(endStr) : effectiveEnd;

      let cur = rangeStart;
      while (cur <= rangeEnd) {
        addItem(assignee, fmtDate(cur), item);
        cur = addDays(cur, 1);
      }
      // If item starts before view but hasn't ended yet, still show on first date
      if (startD < parseDate(startStr) && effectiveEnd >= parseDate(startStr)) {
        // already handled above
      } else if (startD >= parseDate(startStr) && startD <= parseDate(endStr)) {
        // already handled
      }
    }

    for (const issue of issues) {
      const assignee = issue.assignee || '미지정';
      const row = ensureRow(assignee);
      if (issue.issueArea && !row.roles.includes(issue.issueArea)) row.roles.push(issue.issueArea);

      const startD = issue.occurredAt ? parseDate(issue.occurredAt) : null;
      if (!startD) continue;

      const item: DayItem = {
        type: 'issue',
        id: issue.id,
        label: issue.issueContent,
        sub: issue.issueArea,
        status: issue.resolvedAt ? 'resolved' : 'open',
        startDate: fmtDate(startD),
        endDate: issue.resolvedAt ? issue.resolvedAt : undefined,
        resolved: !!issue.resolvedAt,
      };

      if (fmtDate(startD) >= startStr && fmtDate(startD) <= endStr) {
        addItem(assignee, fmtDate(startD), item);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.assignee.localeCompare(b.assignee));
  }, [tasks, issues, startStr, endStr]);

  // ── filtered rows ──
  const filteredRows = useMemo(() => {
    let r = rows;
    if (filterAssignee) r = r.filter(row => row.assignee.includes(filterAssignee));
    if (showOnlyActive) r = r.filter(row => {
      for (const items of row.items.values()) {
        if (items.some(i => i.status !== 'done' && i.status !== 'resolved')) return true;
      }
      return false;
    });
    return r;
  }, [rows, filterAssignee, showOnlyActive]);

  // unique assignees for filter dropdown
  const allAssignees = useMemo(() => [...new Set(rows.map(r => r.assignee))].sort(), [rows]);

  // ── stats ──
  const totalItems = useMemo(() =>
    filteredRows.reduce((sum, row) => {
      let cnt = 0;
      for (const items of row.items.values()) cnt += items.length;
      return sum + cnt;
    }, 0), [filteredRows]);

  const COL_W = viewMode === 'month' ? 80 : 110;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">WBS 작업 흐름</h1>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            담당자별 역할 · 날짜별 업무 현황
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date navigation */}
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            <button onClick={movePrev}
              className="p-1.5 hover:bg-card rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={moveToday}
              className="px-3 py-1 text-xs font-medium hover:bg-card rounded-md text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {startStr} ~ {endStr}
            </button>
            <button onClick={moveNext}
              className="p-1.5 hover:bg-card rounded-md text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View mode */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 text-xs">
            {(['week', 'twoWeek', 'month'] as ViewMode[]).map(m => (
              <button key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {m === 'week' ? '1주' : m === 'twoWeek' ? '2주' : '1달'}
              </button>
            ))}
          </div>

          {/* Assignee filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="text-xs bg-secondary border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">전체 담당자</option>
              {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Active only toggle */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)}
              className="accent-primary" />
            진행중만 보기
          </label>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{filteredRows.length}명</span>
            <span>·</span>
            <span>{totalItems}건</span>
          </div>
        </div>
      </div>

      <SummaryBar tasks={tasks} issues={issues} />

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">이 기간에 해당하는 작업/이슈가 없습니다.</p>
          </div>
        ) : (
          <table className="border-collapse min-w-full text-xs">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                {/* Assignee header */}
                <th className="sticky left-0 z-30 bg-card border-b border-r border-border px-3 py-2 text-left w-40 min-w-[160px]">
                  <span className="text-xs font-semibold text-muted-foreground">담당자 / 역할</span>
                </th>
                {dates.map(d => {
                  const ds = fmtDate(d);
                  const isTodayCol = ds === todayStr;
                  const isWE = isWeekend(d);
                  return (
                    <th key={ds}
                      className={`border-b border-r border-border px-1 py-2 text-center font-medium transition-colors
                        ${isTodayCol ? 'bg-primary/10 text-primary' : isWE ? 'text-muted-foreground/50 bg-secondary/30' : 'text-muted-foreground'}`}
                      style={{ minWidth: COL_W, width: COL_W }}>
                      <div className="leading-tight">
                        <div className={`text-[11px] font-semibold ${isTodayCol ? 'text-primary' : ''}`}>
                          {dayLabel(d)}
                        </div>
                        {isTodayCol && (
                          <div className="text-[9px] text-primary font-bold">TODAY</div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rowIdx) => {
                const totalItemsInRow = Array.from(row.items.values()).flat().length;
                return (
                  <tr key={row.assignee}
                    className={rowIdx % 2 === 0 ? 'bg-background' : 'bg-secondary/10'}>
                    {/* Assignee cell */}
                    <td className="sticky left-0 z-10 border-b border-r border-border px-3 py-2 align-top"
                      style={{ backgroundColor: rowIdx % 2 === 0 ? 'hsl(var(--background))' : 'hsl(var(--secondary)/0.1)' }}>
                      <div className="font-semibold text-foreground text-xs mb-0.5">{row.assignee}</div>
                      <div className="flex flex-wrap gap-1">
                        {row.roles.slice(0, 4).map(role => (
                          <span key={role}
                            className={`text-[9px] px-1.5 py-0.5 rounded-full ${MODULE_COLOR[role] ?? 'bg-secondary text-muted-foreground'}`}>
                            {role}
                          </span>
                        ))}
                        {row.roles.length > 4 && (
                          <span className="text-[9px] text-muted-foreground">+{row.roles.length - 4}</span>
                        )}
                      </div>
                      <div className="mt-1 text-[9px] text-muted-foreground/60">{totalItemsInRow}건</div>
                    </td>
                    {dates.map(d => {
                      const ds = fmtDate(d);
                      const items = row.items.get(ds) ?? [];
                      const isTodayCol = ds === todayStr;
                      const isWE = isWeekend(d);
                      // Deduplicate items by id (task spans multiple days)
                      const seen = new Set<string>();
                      const uniqueItems = items.filter(item => {
                        if (seen.has(item.id)) return false;
                        seen.add(item.id);
                        return true;
                      });
                      return (
                        <td key={ds}
                          className={`border-b border-r border-border px-1 py-1 align-top
                            ${isTodayCol ? 'bg-primary/5' : isWE ? 'bg-secondary/20' : ''}`}
                          style={{ minWidth: COL_W, width: COL_W }}>
                          <div className="flex flex-col gap-0.5">
                            {uniqueItems.map(item => (
                              <ItemCard key={`${item.id}-${ds}`} item={item} onClick={() => setSelectedItem(item)} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-border bg-card flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">범례:</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/30 inline-block" /> 작업 (Tasks)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-orange-500/30 inline-block" /> 이슈 (Issues)</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" /> 완료/해결</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" /> 진행중</span>
        <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-400" /> 미해결</span>
        <span className="ml-auto text-[10px]">클릭 시 상세 정보</span>
      </div>

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
