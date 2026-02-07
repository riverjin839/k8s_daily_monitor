import { Addon } from '@/types';
import { StatusBadge } from './StatusBadge';
import { formatRelativeTime } from '@/lib/utils';

interface AddonCardProps {
  addon: Addon;
  onClick?: () => void;
}

function EtcdDetails({ details }: { details: Record<string, string | number> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {details.isLeader !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          {details.isLeader ? '👑 Leader' : '📋 Follower'}
        </span>
      )}
      {details.version && (
        <span className="text-xs text-muted-foreground font-mono">
          v{details.version}
        </span>
      )}
      {details.dbSizeMb !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          DB: {details.dbSizeMb}MB
        </span>
      )}
      {details.memberCount !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          Members: {details.memberCount}
        </span>
      )}
      {details.raftTerm !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          Term: {details.raftTerm}
        </span>
      )}
    </div>
  );
}

export function AddonCard({ addon, onClick }: AddonCardProps) {
  const isEtcd = addon.type === 'etcd-leader' || addon.type === 'etcdLeader';

  return (
    <div
      className="bg-card border border-border rounded-xl p-5 hover:border-muted-foreground/30 transition-all cursor-pointer hover:-translate-y-0.5"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center text-xl">
          {addon.icon}
        </div>
        <StatusBadge status={addon.status} />
      </div>

      <h3 className="text-base font-semibold mb-1">{addon.name}</h3>
      <p className="text-sm text-muted-foreground mb-4">{addon.description}</p>

      <div className="pt-4 border-t border-border space-y-2">
        {isEtcd && addon.details ? (
          <EtcdDetails details={addon.details} />
        ) : (
          addon.details &&
          Object.entries(addon.details)
            .slice(0, 2)
            .map(([key, value]) => (
              <span
                key={key}
                className="text-xs text-muted-foreground font-mono flex items-center gap-1.5"
              >
                {key}: {value}
              </span>
            ))
        )}
        <div className="flex items-center gap-4">
          {addon.responseTime !== undefined && addon.responseTime > 0 && (
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
              ⏱ {addon.responseTime}ms
            </span>
          )}
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {formatRelativeTime(addon.lastCheck)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface AddonGridProps {
  addons: Addon[];
  isLoading?: boolean;
  onAddonClick?: (addon: Addon) => void;
  onAddEtcdAddon?: () => void;
}

export function AddonGrid({ addons, isLoading, onAddonClick, onAddEtcdAddon }: AddonGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-5 h-44 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (addons.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No addons configured for this cluster</p>
        {onAddEtcdAddon && (
          <button
            onClick={onAddEtcdAddon}
            className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
          >
            + Add etcd Leader Health Check
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {addons.map((addon) => (
        <AddonCard
          key={addon.id}
          addon={addon}
          onClick={() => onAddonClick?.(addon)}
        />
      ))}
    </div>
  );
}
