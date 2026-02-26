import { MetricCard as MetricCardType, MetricQueryResult } from '@/types';
import { ExternalLink, Trash2, Pencil, AlertTriangle, WifiOff } from 'lucide-react';

interface MetricCardProps {
  card: MetricCardType;
  result?: MetricQueryResult;
  onDelete?: () => void;
  onEdit?: () => void;
}

// ── Threshold parser ─────────────────────────────────────
function parseThresholds(thresholds?: string): { warning: number; critical: number } | null {
  if (!thresholds) return null;
  const parts = thresholds.split(',');
  let warning = Infinity;
  let critical = Infinity;
  for (const part of parts) {
    const [level, val] = part.trim().split(':');
    if (level === 'warning') warning = parseFloat(val);
    if (level === 'critical') critical = parseFloat(val);
  }
  return { warning, critical };
}

function getThresholdColor(value: number | null | undefined, thresholds?: string): string {
  if (value == null) return 'text-muted-foreground';
  const t = parseThresholds(thresholds);
  if (!t) return 'text-foreground';
  if (value >= t.critical) return 'text-red-400';
  if (value >= t.warning) return 'text-yellow-400';
  return 'text-green-400';
}

function getThresholdBgColor(value: number | null | undefined, thresholds?: string): string {
  if (value == null) return 'bg-secondary';
  const t = parseThresholds(thresholds);
  if (!t) return 'bg-blue-500';
  if (value >= t.critical) return 'bg-red-500';
  if (value >= t.warning) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ── Format value ─────────────────────────────────────────
function formatValue(value: number | null | undefined, unit: string): string {
  if (value == null) return '—';
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'bytes/s') {
    if (value > 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} GB/s`;
    if (value > 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB/s`;
    if (value > 1024) return `${(value / 1024).toFixed(1)} KB/s`;
    return `${value.toFixed(0)} B/s`;
  }
  if (unit === 'bytes') {
    if (value > 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} GB`;
    if (value > 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
    return `${value.toFixed(0)} B`;
  }
  if (unit === 'count') return value.toFixed(0);
  return value.toFixed(2);
}

// ── Gauge display ────────────────────────────────────────
function GaugeDisplay({ value, thresholds, unit }: { value: number | null | undefined; thresholds?: string; unit: string }) {
  const pct = Math.min(Math.max(value ?? 0, 0), 100);
  const color = getThresholdBgColor(value, thresholds);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className={`text-2xl font-bold font-mono ${getThresholdColor(value, thresholds)}`}>
          {formatValue(value, unit)}
        </span>
      </div>
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Value display ────────────────────────────────────────
function ValueDisplay({ value, thresholds, unit }: { value: number | null | undefined; thresholds?: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`text-3xl font-bold font-mono ${getThresholdColor(value, thresholds)}`}>
        {formatValue(value, unit)}
      </span>
    </div>
  );
}

// ── List display ─────────────────────────────────────────
function ListDisplay({ results }: { results?: Array<Record<string, unknown>> | null }) {
  if (!results || results.length === 0) {
    return <span className="text-sm text-green-400 font-mono">None detected</span>;
  }

  return (
    <div className="space-y-1 max-h-28 overflow-y-auto">
      {results.slice(0, 5).map((item, i) => {
        const labels = (item.labels || {}) as Record<string, string>;
        const val = item.value as number;
        const name = labels.persistentvolumeclaim || labels.namespace || labels.pod || `item-${i}`;
        return (
          <div key={i} className="flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground truncate max-w-[160px]">{name}</span>
            <span className="text-yellow-400">{typeof val === 'number' ? `${val.toFixed(1)}%` : String(val)}</span>
          </div>
        );
      })}
      {results.length > 5 && (
        <span className="text-xs text-muted-foreground">+{results.length - 5} more</span>
      )}
    </div>
  );
}

// ── Status overlay ───────────────────────────────────────
function StatusOverlay({ result }: { result?: MetricQueryResult }) {
  if (!result) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        Loading...
      </div>
    );
  }
  if (result.status === 'offline') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-400">
        <WifiOff className="w-3 h-3" />
        Prometheus offline
      </div>
    );
  }
  if (result.status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400">
        <AlertTriangle className="w-3 h-3" />
        {result.error || 'Query error'}
      </div>
    );
  }
  return null;
}

// ── Main Card ────────────────────────────────────────────
export function MetricCard({ card, result, onDelete, onEdit }: MetricCardProps) {
  const hasError = result && result.status !== 'ok';

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-muted-foreground/30 transition-all hover:-translate-y-0.5 relative group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center text-xl">
          {card.icon}
        </div>
        <div className="flex items-center gap-1.5">
          {card.grafanaPanelUrl && (
            <a
              href={card.grafanaPanelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              title="Open in Grafana"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 hover:bg-secondary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              title="Edit card"
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              title="Delete card"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          )}
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-secondary text-muted-foreground uppercase tracking-wider">
            {card.category}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold mb-1">{card.title}</h3>
      {card.description && (
        <p className="text-sm text-muted-foreground mb-4">{card.description}</p>
      )}

      {/* Content */}
      <div className="pt-4 border-t border-border">
        {hasError ? (
          <StatusOverlay result={result} />
        ) : !result ? (
          <StatusOverlay />
        ) : card.displayType === 'gauge' ? (
          <GaugeDisplay value={result.value} thresholds={card.thresholds} unit={card.unit} />
        ) : card.displayType === 'list' ? (
          <ListDisplay results={result.results} />
        ) : (
          <ValueDisplay value={result.value} thresholds={card.thresholds} unit={card.unit} />
        )}
      </div>

      {/* PromQL hint */}
      <div className="mt-3 text-[10px] text-muted-foreground/50 font-mono truncate" title={card.promql}>
        {card.promql}
      </div>
    </div>
  );
}
