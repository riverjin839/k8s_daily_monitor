import { SummaryStats as SummaryStatsType } from '@/types';

interface SummaryStatsProps {
  stats: SummaryStatsType;
  isLoading?: boolean;
}

interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  colorClass: string;
  bgClass: string;
}

function StatCard({ title, value, icon, colorClass, bgClass }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
      <div>
        <h3 className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">
          {title}
        </h3>
        <p className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${bgClass}`}>
        {icon}
      </div>
    </div>
  );
}

const defaultStats: SummaryStatsType = { totalClusters: 0, healthy: 0, warning: 0, critical: 0 };

export function SummaryStats({ stats, isLoading }: SummaryStatsProps) {
  const s = stats ?? defaultStats;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-5 h-24 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        title="Total Clusters"
        value={s.totalClusters}
        icon="☸"
        colorClass="text-foreground"
        bgClass="bg-primary/10"
      />
      <StatCard
        title="Healthy"
        value={s.healthy}
        icon="✓"
        colorClass="text-status-healthy"
        bgClass="bg-status-healthy/10"
      />
      <StatCard
        title="Warning"
        value={s.warning}
        icon="!"
        colorClass="text-status-warning"
        bgClass="bg-status-warning/10"
      />
      <StatCard
        title="Critical"
        value={s.critical}
        icon="✕"
        colorClass="text-status-critical"
        bgClass="bg-status-critical/10"
      />
    </div>
  );
}
