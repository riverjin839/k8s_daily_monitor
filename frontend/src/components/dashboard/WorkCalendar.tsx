import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useIssues } from '@/hooks/useIssues';
import { stripHtml } from '@/lib/utils';
import { Task, Issue, KanbanStatus } from '@/types';

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
      case 0: return 'bg-secondary/40';
      case 1: return 'bg-primary/15';
      case 2: return 'bg-primary/30';
      case 3: return 'bg-primary/55';
      case 4: return 'bg-primary/80 text-primary-foreground';
      default: return '';
    }
  };

  const selectedDateLabel = (() => {
    const d = new Date(selected + 'T00:00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
      {/* Calendar grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={goPrev}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="이전 달"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">
              {cursor.y}년 {cursor.m + 1}월
            </span>
            <button
              onClick={goNext}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="다음 달"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className="ml-1 px-2 py-1 rounded-md text-[11px] border border-border hover:bg-secondary transition-colors"
            >
              오늘
            </button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>예정 {monthTotals.scheduled}</span>
            <span>완료 {monthTotals.completed}</span>
            <span>이슈 {monthTotals.issues}</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-center py-1 font-medium ${
                i === 0 ? 'text-red-400/80' : i === 6 ? 'text-blue-400/80' : ''
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const key = toDateKey(d);
            const b = buckets.get(key);
            const total = (b?.scheduled.length ?? 0) + (b?.completed.length ?? 0) + (b?.issues.length ?? 0);
            const lvl = intensityLevel(total);
            const inMonth = d.getMonth() === cursor.m;
            const isToday = key === todayKey;
            const isSelected = key === selected;
            const dow = d.getDay();
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-start p-1.5 text-[11px] transition-all border ${
                  isSelected
                    ? 'border-primary ring-1 ring-primary/40'
                    : isToday
                    ? 'border-primary/50'
                    : 'border-transparent hover:border-border'
                } ${intensityClass(lvl)} ${!inMonth ? 'opacity-35' : ''}`}
                title={`${key} · 예정 ${b?.scheduled.length ?? 0} · 완료 ${b?.completed.length ?? 0} · 이슈 ${b?.issues.length ?? 0}`}
              >
                <span
                  className={`font-semibold tabular-nums ${
                    isToday
                      ? 'text-primary'
                      : lvl >= 4
                      ? ''
                      : dow === 0
                      ? 'text-red-400/90'
                      : dow === 6
                      ? 'text-blue-400/90'
                      : ''
                  }`}
                >
                  {d.getDate()}
                </span>
                {total > 0 && (
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-0.5">
                    {(b?.completed.length ?? 0) > 0 && (
                      <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    )}
                    {(b?.scheduled.length ?? 0) > 0 && (
                      <span className="w-1 h-1 rounded-full bg-blue-400" />
                    )}
                    {(b?.issues.length ?? 0) > 0 && (
                      <span className="w-1 h-1 rounded-full bg-amber-400" />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
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
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 완료
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> 예정
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 이슈
            </span>
          </div>
        </div>
      </div>

      {/* Selected day detail */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">{selectedDateLabel}</p>
          <span className="text-[11px] text-muted-foreground">
            총 {selectedBucket.scheduled.length + selectedBucket.completed.length + selectedBucket.issues.length}건
          </span>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto max-h-[320px] pr-1">
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
              <div className="text-center text-xs text-muted-foreground py-8">
                해당 날짜의 작업/이슈가 없습니다.
              </div>
            )}
        </div>

        <div className="flex items-center justify-end pt-2">
          <Link
            to="/todo-today"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            오늘 할일 상세 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
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
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span>({count})</span>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 6).map((it) => (
          <li
            key={it.id}
            className="text-xs px-2 py-1.5 rounded-md bg-secondary/40 hover:bg-secondary/60 transition-colors"
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
