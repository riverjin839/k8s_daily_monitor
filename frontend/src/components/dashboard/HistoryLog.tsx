import { CheckLog } from '@/types';
import { StatusDot } from './StatusBadge';
import { formatDateTime } from '@/lib/utils';

interface HistoryLogProps {
  logs: CheckLog[];
  isLoading?: boolean;
  maxItems?: number;
  onViewAll?: () => void;
}

export function HistoryLog({ logs, isLoading, maxItems = 10, onViewAll }: HistoryLogProps) {
  const displayLogs = logs.slice(0, maxItems);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          📋 Recent Check History
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="px-3 py-1.5 text-sm font-medium bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
          >
            View All
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-secondary/50 rounded mb-2 animate-pulse" />
            ))}
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No check history available
          </div>
        ) : (
          displayLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center px-6 py-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors"
            >
              <StatusDot status={log.status} size="md" />
              <div className="ml-4 flex-1 min-w-0">
                <p className="text-sm truncate">{log.message}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {formatDateTime(log.checkedAt)}
                </p>
              </div>
              <span className="ml-4 px-2.5 py-1 bg-secondary rounded-md text-xs font-mono text-muted-foreground">
                {log.clusterName}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
