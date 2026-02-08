import { Addon } from '@/types';
import { StatusBadge } from './StatusBadge';
import { formatRelativeTime } from '@/lib/utils';

interface AddonCardProps {
  addon: Addon;
  onClick?: () => void;
}

// ── Detail type definitions ────────────────────────────

// Addon.details 는 backend JSONB에서 nested object를 포함하므로 Addon['details'] 그대로 사용
type Details = NonNullable<Addon['details']>;

interface NodeIssue {
  node: string;
  reason: string;
}

interface ComponentStatus {
  name: string;
  status: string;
  latencyMs?: number;
  ready?: number;
  total?: number;
}

// ── Type-specific detail renderers ─────────────────────

function EtcdDetails({ details }: { details: Details }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {details.isLeader !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">
          {details.isLeader ? '👑 Leader' : '📋 Follower'}
        </span>
      )}
      {details.version && (
        <span className="text-xs text-muted-foreground font-mono">v{details.version}</span>
      )}
      {details.dbSizeMb !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">DB: {details.dbSizeMb}MB</span>
      )}
      {details.memberCount !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">Members: {details.memberCount}</span>
      )}
      {details.raftTerm !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">Term: {details.raftTerm}</span>
      )}
    </div>
  );
}

function NodeDetails({ details }: { details: Details }) {
  const total = Number(details.total ?? 0);
  const ready = Number(details.ready ?? 0);
  const issues: NodeIssue[] = Array.isArray(details.issues) ? details.issues : [];
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold font-mono ${ready < total ? 'text-yellow-400' : 'text-green-400'}`}>
          {ready}/{total} Ready
        </span>
        {issues.length > 0 && (
          <span className="text-xs text-red-400 font-mono">⚠ {issues.length} pressure</span>
        )}
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ControlPlaneDetails({ details }: { details: Details }) {
  const components: ComponentStatus[] = Array.isArray(details.components) ? details.components : [];
  const apiLatency = Number(details.apiLatencyMs ?? 0);

  return (
    <div className="space-y-1.5">
      {components.map((comp) => (
        <div key={comp.name} className="flex items-center justify-between text-xs font-mono">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${
              comp.status === 'healthy' ? 'bg-green-500' : comp.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            {comp.name}
          </span>
          {comp.latencyMs !== undefined ? (
            <span className="text-muted-foreground">{comp.latencyMs}ms</span>
          ) : comp.ready !== undefined ? (
            <span className="text-muted-foreground">{comp.ready}/{comp.total}</span>
          ) : null}
        </div>
      ))}
      {apiLatency > 0 && (
        <div className="text-xs text-muted-foreground font-mono pt-1 border-t border-border/50">
          API Latency: {apiLatency}ms
        </div>
      )}
    </div>
  );
}

function SystemPodDetails({ details }: { details: Details }) {
  const readyPods = Number(details.readyPods ?? 0);
  const totalPods = Number(details.totalPods ?? 0);
  const totalNodes = details.totalNodes != null ? Number(details.totalNodes) : undefined;
  const ratioPct = details.ratioPct != null ? Number(details.ratioPct) : undefined;
  const kind = String(details.kind ?? 'deployment');

  const denominator = kind === 'daemonset' && totalNodes !== undefined ? totalNodes : totalPods;
  const pct = denominator > 0 ? Math.round((readyPods / denominator) * 100) : 0;
  const displayPct = ratioPct !== undefined ? ratioPct : pct;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold font-mono">
          {readyPods}/{denominator} Ready
        </span>
        <span className="text-xs text-muted-foreground font-mono">{displayPct}%</span>
      </div>
      <div className="w-full bg-secondary rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${displayPct >= 100 ? 'bg-green-500' : displayPct > 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(displayPct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Detail renderer dispatcher ─────────────────────────

function AddonDetails({ addon }: { addon: Addon }) {
  if (!addon.details) return null;

  switch (addon.type) {
    case 'etcd-leader':
    case 'etcdLeader':
      return <EtcdDetails details={addon.details} />;
    case 'node-check':
    case 'nodeCheck':
      return <NodeDetails details={addon.details} />;
    case 'control-plane':
    case 'controlPlane':
      return <ControlPlaneDetails details={addon.details} />;
    case 'system-pod':
    case 'systemPod':
      return <SystemPodDetails details={addon.details} />;
    default:
      return (
        <>
          {Object.entries(addon.details).slice(0, 2).map(([key, value]) => (
            <span key={key} className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
              {key}: {String(value)}
            </span>
          ))}
        </>
      );
  }
}

// ── Main card ──────────────────────────────────────────

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

      <div className="pt-4 border-t border-border space-y-2">
        <AddonDetails addon={addon} />
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

// ── Grid ───────────────────────────────────────────────

interface AddonGridProps {
  addons: Addon[];
  isLoading?: boolean;
  onAddonClick?: (addon: Addon) => void;
  onAddDefaultAddons?: () => void;
}

export function AddonGrid({ addons, isLoading, onAddonClick, onAddDefaultAddons }: AddonGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 h-44 animate-pulse" />
        ))}
      </div>
    );
  }

  if (addons.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">No addons configured for this cluster</p>
        {onAddDefaultAddons && (
          <button
            onClick={onAddDefaultAddons}
            className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
          >
            + Add Default Health Checks
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {addons.map((addon) => (
          <AddonCard key={addon.id} addon={addon} onClick={() => onAddonClick?.(addon)} />
        ))}
      </div>
      {onAddDefaultAddons && (
        <div className="text-center">
          <button
            onClick={onAddDefaultAddons}
            className="px-4 py-2 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors"
          >
            + Add Missing Health Checks
          </button>
        </div>
      )}
    </div>
  );
}
