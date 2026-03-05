import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import type { Task, Issue } from '@/types';
import { classifyTask } from '@/components/tasks/TaskKanban';

// ── 색상 ──────────────────────────────────────────────────────────────────────
const TASK_COLORS: Record<string, string> = {
  '예정': '#f59e0b',
  '지연': '#ef4444',
  '완료': '#10b981',
};

const ISSUE_COLORS: Record<string, string> = {
  '미해결': '#f59e0b',
  '해결':   '#10b981',
};

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────
interface TooltipPayload {
  name: string;
  value: number;
  fill: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}건</p>
      ))}
    </div>
  );
}

// ── 스켈레톤 ──────────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="flex items-end gap-3 h-32 px-4 pb-2">
      {[60, 90, 40].map((h, i) => (
        <div key={i} className="flex-1 bg-muted/40 rounded animate-pulse" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
interface KanbanSummaryChartsProps {
  tasks: Task[];
  issues: Issue[];
  isLoading?: boolean;
  selectedClusterId?: string | null;
}

export function KanbanSummaryCharts({ tasks, issues, isLoading, selectedClusterId }: KanbanSummaryChartsProps) {
  // 클러스터 필터 적용
  const filteredTasks  = selectedClusterId ? tasks.filter((t) => t.clusterId === selectedClusterId)  : tasks;
  const filteredIssues = selectedClusterId ? issues.filter((i) => i.clusterId === selectedClusterId) : issues;

  // 집계
  const taskCounts = {
    '예정': filteredTasks.filter((t) => classifyTask(t) === 'scheduled').length,
    '지연': filteredTasks.filter((t) => classifyTask(t) === 'delayed').length,
    '완료': filteredTasks.filter((t) => classifyTask(t) === 'completed').length,
  };

  const issueCounts = {
    '미해결': filteredIssues.filter((i) => !i.resolvedAt).length,
    '해결':   filteredIssues.filter((i) => !!i.resolvedAt).length,
  };

  const taskData  = Object.entries(taskCounts).map(([name, value]) => ({ name, value }));
  const issueData = Object.entries(issueCounts).map(([name, value]) => ({ name, value }));

  const totalTasks  = filteredTasks.length;
  const totalIssues = filteredIssues.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Task 상태 분포 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">작업 상태 분포</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              전체 {totalTasks}건
              {selectedClusterId && ' (선택 클러스터)'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {taskData.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: TASK_COLORS[d.name] }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="font-semibold">{d.value}</span>
              </span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <ChartSkeleton />
        ) : totalTasks === 0 ? (
          <div className="h-32 flex items-center justify-center text-xs text-muted-foreground/50">
            데이터 없음
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={taskData} barCategoryGap="35%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="건수">
                {taskData.map((entry) => (
                  <Cell key={entry.name} fill={TASK_COLORS[entry.name] ?? '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Issue 상태 분포 */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">이슈 상태 분포</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              전체 {totalIssues}건
              {selectedClusterId && ' (선택 클러스터)'}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            {issueData.map((d) => (
              <span key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: ISSUE_COLORS[d.name] }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="font-semibold">{d.value}</span>
              </span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <ChartSkeleton />
        ) : totalIssues === 0 ? (
          <div className="h-32 flex items-center justify-center text-xs text-muted-foreground/50">
            데이터 없음
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={issueData} barCategoryGap="50%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend wrapperStyle={{ display: 'none' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="건수">
                {issueData.map((entry) => (
                  <Cell key={entry.name} fill={ISSUE_COLORS[entry.name] ?? '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
