import { Addon } from '@/types';
import { StatusBadge } from './StatusBadge';
import { formatRelativeTime } from '@/lib/utils';

interface AddonCardProps {
  addon: Addon;
  onClick?: () => void;
}

export function AddonCard({ addon, onClick }: AddonCardProps) {
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

      <div className="flex items-center gap-4 pt-4 border-t border-border">
        {addon.responseTime !== undefined && (
          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
            ⏱ {addon.responseTime}ms
          </span>
        )}
        {addon.details &&
          Object.entries(addon.details)
            .slice(0, 1)
            .map(([key, value]) => (
              <span
                key={key}
                className="text-xs text-muted-foreground font-mono flex items-center gap-1.5"
              >
                {key}: {value}
              </span>
            ))}
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {formatRelativeTime(addon.lastCheck)}
        </span>
      </div>
    </div>
  );
}

interface AddonGridProps {
  addons: Addon[];
  isLoading?: boolean;
  onAddonClick?: (addon: Addon) => void;
}

export function AddonGrid({ addons, isLoading, onAddonClick }: AddonGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
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
      <div className="text-center py-12 text-muted-foreground">
        No addons configured for this cluster
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
