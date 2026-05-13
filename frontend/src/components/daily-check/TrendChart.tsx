import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { MacCard } from '@/components/ui/MacCard';
import type { DailyCheckTrend } from '@/types';

interface Props {
  trend: DailyCheckTrend | undefined;
  days?: number;
}

export function TrendChart({ trend, days = 7 }: Props) {
  if (!trend || trend.points.length === 0) {
    return (
      <MacCard title={`최근 ${days}일 추이`}>
        <div className="text-sm text-muted-foreground italic">
          최근 {days}일간의 점검 기록이 없습니다.
        </div>
      </MacCard>
    );
  }

  const data = trend.points.map((p) => ({
    time: p.checkedAt ? new Date(p.checkedAt).toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }) : '',
    errors: p.errors,
    warnings: p.warnings,
    readyNodes: p.readyNodes,
    totalNodes: p.totalNodes,
  }));

  return (
    <MacCard title={`최근 ${days}일 추이`}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {Object.entries(trend.totals || {}).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
            >
              <span
                className={
                  k === 'critical' ? 'h-2 w-2 rounded-full bg-red-500' :
                  k === 'warning'  ? 'h-2 w-2 rounded-full bg-amber-500' :
                  k === 'healthy'  ? 'h-2 w-2 rounded-full bg-emerald-500' :
                                     'h-2 w-2 rounded-full bg-gray-400'
                }
              />
              {k}: {v}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="errors" stroke="#ef4444" name="에러" strokeWidth={2} />
            <Line type="monotone" dataKey="warnings" stroke="#f59e0b" name="경고" strokeWidth={2} />
            <Line type="monotone" dataKey="readyNodes" stroke="#10b981" name="Ready 노드" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </MacCard>
  );
}
