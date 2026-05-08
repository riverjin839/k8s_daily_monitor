import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, Clock, ShieldAlert,
  Plus, CalendarPlus,
} from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useIssues } from '@/hooks/useIssues';
import { stripHtml } from '@/lib/utils';
import { Task, Issue, KanbanStatus } from '@/types';
import { QuickAddTaskModal } from './QuickAddTaskModal';

interface WorkCalendarProps {
  selectedClusterId: string | null;
}

interface DayBucket {
  scheduled: Task[];
  completed: Task[];
  issues: Issue[];
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = new Date(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z');
  return Number.isNaN(t.getTime()) ? null : t;
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const start = new Date(year, month, 1 - startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

const STATUS_LABEL: Record<KanbanStatus, string> = {
  backlog: '백로그',
  todo: '할일',
  in_progress: '진행 중',
  review_test: '검토',
  done: '완료',
};

export function WorkCalendar({ selectedClusterId }: WorkCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [cursor, setCursor] = useState<{ y: number; m: number }>({
    y: today.getFullYear(),
    m: today.getMonth(),
  });
  const [selected, setSelected] = useState<string>(todayKey);
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

  const { data: tasksData } = useTasks();
  const { data: issuesData } = useIssues();

  const buckets = useMemo<Map<string, DayBucket>>(() => {
    const tasks = tasksData?.data ?? [];
    const issues = issuesData?.data ?? [];
    const map = new Map<string, DayBucket>();
    const ensure = (k: string): DayBucket => {
      let b = map.get(k);
      if (!b) {
        b = { scheduled: [], completed: [], issues: [] };
        map.set(k, b);
      }
      return b;
    };
    for (const t of tasks) {
      if (selectedClusterId && t.clusterId !== selectedClusterId) continue;
      const sched = parseDate(t.scheduledAt);
      if (sched) ensure(toDateKey(sched)).scheduled.push(t);
      if (t.completedAt && t.kanbanStatus === 'done') {
        const done = parseDate(t.completedAt);
        if (done) ensure(toDateKey(done)).completed.push(t);
      }
    }
    for (const i of issues) {
      if (selectedClusterId && i.clusterId !== selectedClusterId) continue;
      if (i.occurredAt) ensure(i.occurredAt).issues.push(i);
    }
    return map;
  }, [tasksData, issuesData, selectedClusterId]);

  const grid = useMemo(() => buildMonthGrid(cursor.y, cursor.m), [cursor]);

  const monthTotals = useMemo(() => {
    let scheduled = 0;
    let completed = 0;
    let issues = 0;
    for (const d of grid) {
      if (d.getMonth() !== cursor.m) continue;
      const b = buckets.get(toDateKey(d));
      if (!b) continue;
      scheduled += b.scheduled.length;
      completed += b.completed.length;
      issues += b.issues.length;
    }
    return { scheduled, completed, issues };
  }, [buckets, grid, cursor.m]);

  const selectedBucket = buckets.get(selected) ?? { scheduled: [], completed: [], issues: [] };

  const goPrev = () => {
    const d = new Date(cursor.y, cursor.m - 1, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goNext = () => {
    const d = new Date(cursor.y, cursor.m + 1, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goToday = () => {
    setCursor({ y: today.getFullYear(), m: today.getMonth() });
    setSelected(todayKey);
  };

  // Color intensity: 0..4 levels based on scheduled+completed+issues count
  const intensityLevel = (count: number): number => {
    if (count === 0) return 0;
    if (count <= 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  };
  const intensityClass = (lvl: number): string => {
    switch (lvl) {
      case 0: return 'bg-secondary/30';
      case 1: return 'bg-primary/10';
      case 2: return 'bg-primary/20';
      case 3: return 'bg-primary/40';
      case 4: return 'bg-primary/65';
      default: return '';
    }
  };

  const selectedDateLabel = (() => {
    const d = new Date(selected + 'T00:00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  })();

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-4">
        {/* ── Calendar grid ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Month nav row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-secondary/60 rounded-xl p-0.5">
              <button
                onClick={goPrev}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                title="이전 달"
                aria-label="이전 달"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-sm font-semibold tabular-nums select-none">
                {cursor.y}년 {cursor.m + 1}월
              </span>
              <button
                onClick={goNext}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                title="다음 달"
                aria-label="다음 달"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goToday}
                className="ml-0.5 px-2.5 py-1 rounded-lg text-[11px] font-medium hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
              >
                오늘
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300">
                <Clock className="w-3 h-3" /> 예정 {monthTotals.scheduled}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="w-3 h-3" /> 완료 {monthTotals.completed}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300">
                <ShieldAlert className="w-3 h-3" /> 이슈 {monthTotals.issues}
              </span>
            </div>
          </div>

          {/* Week-day header */}
          <div className="grid grid-cols-7 gap-1 px-1 text-[11px] text-muted-foreground select-none">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`text-center py-1.5 font-semibold ${
                  i === 0 ? 'text-red-400/90' : i === 6 ? 'text-blue-400/90' : ''
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1.5 p-1.5 rounded-2xl bg-secondary/20 border border-border/40">
            {grid.map((d) => {
              const key = toDateKey(d);
              const b = buckets.get(key) ?? { scheduled: [], completed: [], issues: [] };
              const total = b.scheduled.length + b.completed.length + b.issues.length;
              const lvl = intensityLevel(total);
              const inMonth = d.getMonth() === cursor.m;
              const isToday = key === todayKey;
              const isSelected = key === selected;
              const dow = d.getDay();
              const dayNumberClr = isToday
                ? 'text-primary'
                : dow === 0
                ? 'text-red-400/90'
                : dow === 6
                ? 'text-blue-400/90'
                : 'text-foreground/85';

              return (
                <div
                  key={key}
                  onClick={() => setSelected(key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(key);
                    }
                  }}
                  className={`group relative rounded-xl border bg-card text-left cursor-pointer transition-all flex flex-col p-1.5 min-h-[78px] ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 shadow-sm'
                      : isToday
                      ? 'border-primary/45'
                      : 'border-border/60 hover:border-primary/40 hover:shadow-sm'
                  } ${!inMonth ? 'opacity-45' : ''}`}
                  title={`${key} · 예정 ${b.scheduled.length} · 완료 ${b.completed.length} · 이슈 ${b.issues.length}`}
                >
                  {/* Heatmap shade (background) */}
                  <span
                    className={`absolute inset-0 rounded-xl pointer-events-none ${intensityClass(lvl)} opacity-90`}
                    aria-hidden
                  />

                  {/* Day number row */}
                  <div className="relative flex items-start justify-between gap-1">
                    <span className={`text-[12px] font-semibold tabular-nums leading-none ${dayNumberClr}`}>
                      {d.getDate()}
                      {isToday && (
                        <span className="ml-1 align-super text-[8px] font-bold uppercase tracking-wider text-primary">today</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(key);
                        setQuickAddDate(key);
                      }}
                      className={`w-5 h-5 rounded-md inline-flex items-center justify-center bg-card/80 backdrop-blur-sm shadow-sm border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
                      }`}
                      title="이 날짜에 일정 등록"
                      aria-label={`${key} 일정 등록`}
                      tabIndex={inMonth ? 0 : -1}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Mini event chips */}
                  {total > 0 && (
                    <div className="relative mt-1 space-y-0.5 overflow-hidden flex-1">
                      {b.completed.length > 0 && (
                        <DayChip
                          color="emerald"
                          count={b.completed.length}
                          label={truncate(stripHtml(b.completed[0].taskContent) || '완료')}
                        />
                      )}
                      {b.scheduled.length > 0 && (
                        <DayChip
                          color="blue"
                          count={b.scheduled.length}
                          label={truncate(stripHtml(b.scheduled[0].taskContent) || '예정')}
                        />
                      )}
                      {b.issues.length > 0 && (
                        <DayChip
                          color="amber"
                          count={b.issues.length}
                          label={truncate(stripHtml(b.issues[0].issueContent) || '이슈')}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 px-1 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span>적음</span>
              <span className={`w-3 h-3 rounded ${intensityClass(0)}`} />
              <span className={`w-3 h-3 rounded ${intensityClass(1)}`} />
              <span className={`w-3 h-3 rounded ${intensityClass(2)}`} />
              <span className={`w-3 h-3 rounded ${intensityClass(3)}`} />
              <span className={`w-3 h-3 rounded ${intensityClass(4)}`} />
              <span>많음</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> 완료
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> 예정
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 이슈
              </span>
            </div>
          </div>
        </div>

        {/* ── Selected day detail ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-border/70 bg-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/70 bg-muted/30">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{selectedDateLabel}</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                총 {selectedBucket.scheduled.length + selectedBucket.completed.length + selectedBucket.issues.length}건
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuickAddDate(selected)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors mac-shadow"
              title={`${selectedDateLabel} 에 일정 등록`}
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              일정 등록
            </button>
          </div>

          <div className="px-3 py-3 space-y-3 flex-1 overflow-y-auto max-h-[360px]">
            {selectedBucket.completed.length > 0 && (
              <DayList
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                title="완료"
                count={selectedBucket.completed.length}
                items={selectedBucket.completed.map((t) => ({
                  id: t.id,
                  primary: stripHtml(t.taskContent) || t.taskCategory,
                  meta: `${t.assignee || '미지정'} · ${STATUS_LABEL[t.kanbanStatus]}`,
                }))}
              />
            )}
            {selectedBucket.scheduled.length > 0 && (
              <DayList
                icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
                title="예정"
                count={selectedBucket.scheduled.length}
                items={selectedBucket.scheduled.map((t) => ({
                  id: t.id,
                  primary: stripHtml(t.taskContent) || t.taskCategory,
                  meta: `${t.assignee || '미지정'} · ${STATUS_LABEL[t.kanbanStatus]}`,
                }))}
              />
            )}
            {selectedBucket.issues.length > 0 && (
              <DayList
                icon={<ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
                title="이슈"
                count={selectedBucket.issues.length}
                items={selectedBucket.issues.map((i) => ({
                  id: i.id,
                  primary: stripHtml(i.issueContent) || i.issueArea,
                  meta: `${i.assignee || '미지정'}${i.resolvedAt ? ' · 해결' : ''}`,
                }))}
              />
            )}
            {selectedBucket.scheduled.length === 0 &&
              selectedBucket.completed.length === 0 &&
              selectedBucket.issues.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center text-xs text-muted-foreground py-10 gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                    <CalendarPlus className="w-5 h-5 opacity-50" />
                  </div>
                  <p>해당 날짜의 작업/이슈가 없습니다.</p>
                  <button
                    type="button"
                    onClick={() => setQuickAddDate(selected)}
                    className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> 새 일정 등록
                  </button>
                </div>
              )}
          </div>

          <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-border/60">
            <Link
              to="/todo-today"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              오늘 할일 상세 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      <QuickAddTaskModal
        open={!!quickAddDate}
        defaultDate={quickAddDate ?? selected}
        defaultClusterId={selectedClusterId}
        onClose={() => setQuickAddDate(null)}
      />
    </>
  );
}

function truncate(s: string, n = 14): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface DayChipProps {
  color: 'emerald' | 'blue' | 'amber';
  count: number;
  label: string;
}

const CHIP_COLOR: Record<DayChipProps['color'], string> = {
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  blue:    'bg-blue-500/15    text-blue-700    dark:text-blue-300    border-blue-500/30',
  amber:   'bg-amber-500/15   text-amber-700   dark:text-amber-300   border-amber-500/30',
};

function DayChip({ color, count, label }: DayChipProps) {
  return (
    <div
      className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border truncate ${CHIP_COLOR[color]}`}
    >
      {count > 1 && <span className="font-bold tabular-nums">{count}</span>}
      <span className="truncate">{label}</span>
    </div>
  );
}

interface DayListProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  items: Array<{ id: string; primary: string; meta: string }>;
}

function DayList({ icon, title, count, items }: DayListProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {icon}
        <span>{title}</span>
        <span className="text-foreground tabular-nums">{count}</span>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 6).map((it) => (
          <li
            key={it.id}
            className="text-xs px-2 py-1.5 rounded-lg bg-secondary/40 hover:bg-secondary/70 transition-colors"
          >
            <p className="truncate text-foreground">{it.primary}</p>
            <p className="truncate text-[10px] text-muted-foreground">{it.meta}</p>
          </li>
        ))}
        {items.length > 6 && (
          <li className="text-[10px] text-muted-foreground px-2">+{items.length - 6}건 더…</li>
        )}
      </ul>
    </div>
  );
}
