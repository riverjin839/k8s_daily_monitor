import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Task } from '@/types';

interface TaskCalendarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-400',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

interface TooltipState {
  task: Task;
  x: number;
  y: number;
}

export function TaskCalendar({ tasks, onTaskClick }: TaskCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  // Build calendar grid (Sun-start)
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Group tasks by scheduledAt date
  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    const d = task.scheduledAt?.slice(0, 10);
    if (d) {
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(task);
    }
  }

  const toDateKey = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day;

  const handleDotEnter = (e: React.MouseEvent<HTMLButtonElement>, task: Task) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ task, x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleDotLeave = () => {
    hideTimer.current = setTimeout(() => setTooltip(null), 200);
  };

  const handleTooltipEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const handleTooltipLeave = () => {
    hideTimer.current = setTimeout(() => setTooltip(null), 200);
  };

  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="relative select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={prevMonth}
          className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          aria-label="이전 달"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <span className="text-base font-semibold">
            {year}년 {month + 1}월
          </span>
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              오늘
            </button>
          )}
        </div>

        <button
          onClick={nextMonth}
          className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          aria-label="다음 달"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day name row */}
      <div className="grid grid-cols-7 border-l border-t border-border">
        {DAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={`text-center text-xs font-medium py-2 border-r border-b border-border ${
              i === 0
                ? 'text-red-400'
                : i === 6
                ? 'text-blue-400'
                : 'text-muted-foreground'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 border-l border-border">
        {cells.map((day, idx) => {
          const colIdx = idx % 7;
          const dayTasks = day ? (tasksByDate[toDateKey(day)] ?? []) : [];
          const cellKey = day ? `day-${day}` : `empty-${idx}`;

          return (
            <div
              key={cellKey}
              className={`min-h-[88px] border-r border-b border-border p-1.5 ${
                day ? 'bg-card' : 'bg-muted/5'
              }`}
            >
              {day && (
                <>
                  {/* Date number */}
                  <div
                    className={`text-xs font-medium mb-1.5 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday(day)
                        ? 'bg-primary text-primary-foreground font-bold'
                        : colIdx === 0
                        ? 'text-red-400'
                        : colIdx === 6
                        ? 'text-blue-400'
                        : 'text-foreground/80'
                    }`}
                  >
                    {day}
                  </div>

                  {/* Task dots */}
                  <div className="flex flex-wrap gap-[3px]">
                    {dayTasks.map((task) => (
                      <button
                        key={task.id}
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform hover:scale-125 focus:outline-none ${
                          PRIORITY_COLORS[task.priority] ?? 'bg-slate-400'
                        } ${task.completedAt ? 'opacity-40 ring-1 ring-white/20' : ''}`}
                        onMouseEnter={(e) => handleDotEnter(e, task)}
                        onMouseLeave={handleDotLeave}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                        aria-label={`${task.taskCategory} - ${task.assignee}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1 flex-wrap">
        <span className="text-xs text-muted-foreground">우선순위:</span>
        {(['high', 'medium', 'low'] as const).map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
            {PRIORITY_LABELS[p]}
          </span>
        ))}
        <span className="text-xs text-muted-foreground ml-1">|</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-slate-400 opacity-40" />
          완료된 작업
        </span>
      </div>

      {/* Hover tooltip (fixed position) */}
      {tooltip && (
        <div
          className="fixed z-50"
          style={{
            left: tooltip.x,
            top: tooltip.y - 10,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="bg-popover border border-border rounded-lg shadow-xl p-3 w-52 text-sm">
            {/* Task content header */}
            <div className="flex items-start gap-2 mb-2 pb-2 border-b border-border/60">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 ${
                  PRIORITY_COLORS[tooltip.task.priority] ?? 'bg-slate-400'
                } ${tooltip.task.completedAt ? 'opacity-40' : ''}`}
              />
              <p className="text-xs font-medium leading-tight line-clamp-2 text-foreground">
                {tooltip.task.taskContent}
              </p>
            </div>

            {/* Detail rows */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-[68px] flex-shrink-0">담당자</span>
                <span className="text-xs font-medium text-foreground truncate">{tooltip.task.assignee}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-[68px] flex-shrink-0">대상 클러스터</span>
                <span className="text-xs text-foreground truncate">{tooltip.task.clusterName || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-[68px] flex-shrink-0">작업 분류</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 truncate">
                  {tooltip.task.taskCategory}
                </span>
              </div>
              {tooltip.task.completedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-[68px] flex-shrink-0">완료일</span>
                  <span className="text-xs text-emerald-400 font-mono">
                    {tooltip.task.completedAt.slice(0, 10)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/50 mt-2 pt-1.5 border-t border-border/40">
              클릭하여 상세보기
            </p>
          </div>

          {/* Tooltip caret */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full"
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid hsl(var(--border))',
            }}
          />
        </div>
      )}
    </div>
  );
}
