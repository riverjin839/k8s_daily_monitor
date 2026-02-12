import { useState } from 'react';
import { X, FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useCreateMetricCard, useTestPromql } from '@/hooks/useMetricCards';

interface AddMetricCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'alert', label: 'Alert', icon: '🚨' },
  { value: 'resource', label: 'Resource', icon: '⚡' },
  { value: 'storage', label: 'Storage', icon: '💾' },
  { value: 'network', label: 'Network', icon: '🌐' },
  { value: 'general', label: 'General', icon: '📊' },
];

const DISPLAY_TYPES = [
  { value: 'value', label: 'Single Value', description: 'Large number display' },
  { value: 'gauge', label: 'Gauge Bar', description: 'Progress bar with percentage' },
  { value: 'list', label: 'List', description: 'Multiple results as table' },
];

const UNIT_OPTIONS = ['', '%', 'count', 'bytes', 'bytes/s', 'ms', 'req/s'];

const PROMQL_TEMPLATES = [
  {
    label: 'Pod restart count (last 1h)',
    promql: 'sum(increase(kube_pod_container_status_restarts_total[1h])) by (pod, namespace)',
    unit: 'count',
    displayType: 'list',
    category: 'alert',
  },
  {
    label: 'Node not ready count',
    promql: 'sum(kube_node_status_condition{condition="Ready",status="false"}) OR on() vector(0)',
    unit: 'count',
    displayType: 'value',
    category: 'alert',
  },
  {
    label: 'API Server request latency (p99)',
    promql: 'histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le)) * 1000',
    unit: 'ms',
    displayType: 'value',
    category: 'resource',
  },
  {
    label: 'Pending pods count',
    promql: 'sum(kube_pod_status_phase{phase="Pending"}) OR on() vector(0)',
    unit: 'count',
    displayType: 'value',
    category: 'alert',
  },
];

export function AddMetricCardModal({ isOpen, onClose }: AddMetricCardModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📊');
  const [promql, setPromql] = useState('');
  const [unit, setUnit] = useState('');
  const [displayType, setDisplayType] = useState('value');
  const [category, setCategory] = useState('general');
  const [thresholds, setThresholds] = useState('');
  const [grafanaPanelUrl, setGrafanaPanelUrl] = useState('');

  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testResult, setTestResult] = useState<string>('');

  const createCard = useCreateMetricCard();
  const testQuery = useTestPromql();

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!promql.trim()) return;
    setTestStatus('loading');
    try {
      const { data } = await testQuery.mutateAsync(promql);
      // data has been auto-converted to camelCase by interceptor
      const d = data as unknown as Record<string, unknown>;
      if (d.status === 'ok') {
        setTestStatus('ok');
        const val = d.value != null ? String(d.value) : 'vector result';
        setTestResult(`Result: ${val}`);
      } else {
        setTestStatus('error');
        setTestResult(String(d.error || 'Query failed'));
      }
    } catch {
      setTestStatus('error');
      setTestResult('Failed to reach Prometheus');
    }
  };

  const handleCreate = () => {
    if (!title.trim() || !promql.trim()) return;
    createCard.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      icon,
      promql: promql.trim(),
      unit,
      displayType: displayType as 'value' | 'gauge' | 'list',
      category,
      thresholds: thresholds.trim() || undefined,
      grafanaPanelUrl: grafanaPanelUrl.trim() || undefined,
      sortOrder: 99,
      enabled: true,
    });
    resetForm();
    onClose();
  };

  const handleTemplateSelect = (tpl: typeof PROMQL_TEMPLATES[0]) => {
    setPromql(tpl.promql);
    setUnit(tpl.unit);
    setDisplayType(tpl.displayType);
    setCategory(tpl.category);
    if (!title) setTitle(tpl.label);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setIcon('📊');
    setPromql('');
    setUnit('');
    setDisplayType('value');
    setCategory('general');
    setThresholds('');
    setGrafanaPanelUrl('');
    setTestStatus('idle');
    setTestResult('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Add Metric Card</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Quick Templates */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Quick Templates
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROMQL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => handleTemplateSelect(tpl)}
                  className="text-left p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <div className="text-xs font-medium">{tpl.label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{tpl.promql}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title + Icon */}
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cluster CPU Usage"
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Icon</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short explanation of what this metric shows"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* PromQL Query */}
          <div>
            <label className="block text-sm font-medium mb-1">
              PromQL Query <span className="text-red-400">*</span>
            </label>
            <textarea
              value={promql}
              onChange={(e) => { setPromql(e.target.value); setTestStatus('idle'); }}
              placeholder='e.g. sum(kube_pod_status_phase{phase="Failed"}) OR on() vector(0)'
              rows={3}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            {/* Test button */}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleTest}
                disabled={!promql.trim() || testStatus === 'loading'}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40"
              >
                <FlaskConical className="w-3 h-3" />
                {testStatus === 'loading' ? 'Testing...' : 'Test Query'}
              </button>
              {testStatus === 'ok' && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {testResult}
                </span>
              )}
              {testStatus === 'error' && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {testResult}
                </span>
              )}
            </div>
          </div>

          {/* Category + Display Type + Unit row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Type</label>
              <select
                value={displayType}
                onChange={(e) => setDisplayType(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {DISPLAY_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u || '(none)'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Thresholds */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Thresholds <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={thresholds}
              onChange={(e) => setThresholds(e.target.value)}
              placeholder="warning:70,critical:90"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Color thresholds: green → warning → critical (red)
            </p>
          </div>

          {/* Grafana Deep Link */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Grafana Panel URL <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={grafanaPanelUrl}
              onChange={(e) => setGrafanaPanelUrl(e.target.value)}
              placeholder="http://grafana.monitoring.svc:3000/d/..."
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { resetForm(); onClose(); }}
              className="flex-1 px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || !promql.trim()}
              className="flex-1 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-40"
            >
              Create Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
