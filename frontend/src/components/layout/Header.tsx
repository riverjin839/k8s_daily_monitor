import { useLocation, Link } from 'react-router-dom';
import { useClusterStore } from '@/stores/clusterStore';
import { formatDateTime } from '@/lib/utils';
import { Settings, RefreshCw, LayoutDashboard, BookOpen, ClipboardList } from 'lucide-react';

interface HeaderProps {
  onRunCheck?: () => void;
  onSettings?: () => void;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/playbooks', label: 'Playbooks', icon: BookOpen },
  { to: '/issues', label: '이슈 게시판', icon: ClipboardList },
];

export function Header({ onRunCheck, onSettings }: HeaderProps) {
  const { isChecking, lastCheckTime } = useClusterStore();
  const location = useLocation();

  return (
    <header className="bg-card border-b border-border px-8 h-16 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-700 rounded-lg flex items-center justify-center text-white text-sm">
            ☸
          </div>
          <span className="font-semibold text-lg">K8s Daily Monitor</span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 ml-4">
          {navItems.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        {lastCheckTime && (
          <span className="text-sm text-muted-foreground font-mono">
            Last check: {formatDateTime(lastCheckTime)}
          </span>
        )}

        {onSettings && (
          <button
            onClick={onSettings}
            className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        )}

        {onRunCheck && (
          <button
            onClick={onRunCheck}
            disabled={isChecking}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Run Check'}
          </button>
        )}
      </div>
    </header>
  );
}
