import { useClusterStore } from '@/stores/clusterStore';
import { formatDateTime } from '@/lib/utils';
import { Settings, RefreshCw } from 'lucide-react';

interface HeaderProps {
  onRunCheck: () => void;
  onSettings: () => void;
}

export function Header({ onRunCheck, onSettings }: HeaderProps) {
  const { isChecking, lastCheckTime } = useClusterStore();

  return (
    <header className="bg-card border-b border-border px-8 h-16 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-700 rounded-lg flex items-center justify-center text-white text-sm">
          ☸
        </div>
        <span className="font-semibold text-lg">K8s Daily Monitor</span>
      </div>

      <div className="flex items-center gap-6">
        {lastCheckTime && (
          <span className="text-sm text-muted-foreground font-mono">
            Last check: {formatDateTime(lastCheckTime)}
          </span>
        )}

        <button
          onClick={onSettings}
          className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-2"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>

        <button
          onClick={onRunCheck}
          disabled={isChecking}
          className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Run Check'}
        </button>
      </div>
    </header>
  );
}
