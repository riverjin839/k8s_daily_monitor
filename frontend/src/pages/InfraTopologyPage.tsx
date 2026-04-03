import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Cpu,
  Database,
  HardDrive,
  Link2,
  Loader2,
  Minus,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import {
  useCreateInfraNode,
  useDeleteInfraNode,
  useInfraNodes,
  useSyncInfraNodes,
  useUpdateInfraNode,
} from '@/hooks/useInfraNodes';
import type { InfraNode, InfraNodeCreate, InfraNodeRole } from '@/types';

const ROLE_META: Record<InfraNodeRole, { label: string; color: string; bg: string; dot: string }> = {
  master: { label: 'Master', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', dot: 'bg-blue-400' },
  worker: { label: 'Worker', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
  storage: { label: 'Storage', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' },
  infra: { label: 'Infra', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', dot: 'bg-purple-400' },
};

const ROLES: InfraNodeRole[] = ['master', 'worker', 'storage', 'infra'];
const LAYER_ORDER = ['k8s', 'physical'] as const;
type LayerKey = typeof LAYER_ORDER[number];
type PageMode = 'view' | 'edit';

interface GraphNode {
  id: string;
  layer: LayerKey;
  label: string;
  kind: 'pod' | 'service' | 'k8s-node' | 'port' | 'switch' | 'infra-node';
  x: number;
  y: number;
  metadata?: { rack?: string; namespace?: string; service?: string; switch?: string };
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  layer: LayerKey;
  label?: string;
  type: 'runs-on' | 'service-route' | 'uplink' | 'downlink' | 'manual';
}

interface TraceHop {
  edgeId: string;
  latencyMs: number;
  drops: number;
}

interface TraceResult {
  id: string;
  name: string;
  hops: TraceHop[];
}

interface Filters {
  rack: string;
  switchName: string;
  namespace: string;
  service: string;
}

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { detail?: string } }; message?: string };
  return err?.response?.data?.detail ?? err?.message ?? '알 수 없는 오류';
}

function getNamespaces(clusterName: string) {
  return ['default', 'platform', `team-${clusterName.toLowerCase().slice(0, 4) || 'core'}`];
}

function topologyFromNodes(nodes: InfraNode[], clusterName: string, manualEdges: GraphEdge[]) {
  const graphNodes: GraphNode[] = [];
  const graphEdges: GraphEdge[] = [];

  nodes.forEach((node, index) => {
    const rack = node.rackName || 'Rack-Unknown';
    const switchName = node.switchName || `${rack}-SW`;
    const namespaces = getNamespaces(clusterName);
    const namespace = namespaces[index % namespaces.length];
    const service = `svc-${node.hostname.split('-')[0] || 'app'}`;

    const infraNodeId = `infra:${node.id}`;
    const switchId = `switch:${rack}:${switchName}`;
    const portId = `port:${node.id}`;
    const k8sNodeId = `k8snode:${node.id}`;
    const serviceId = `service:${node.id}`;
    const podId = `pod:${node.id}`;

    graphNodes.push(
      {
        id: k8sNodeId,
        layer: 'k8s',
        label: `${node.hostname} (K8s Node)`,
        kind: 'k8s-node',
        x: 80,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
      {
        id: serviceId,
        layer: 'k8s',
        label: `${service}`,
        kind: 'service',
        x: 320,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
      {
        id: podId,
        layer: 'k8s',
        label: `pod-${node.hostname}`,
        kind: 'pod',
        x: 560,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
      {
        id: infraNodeId,
        layer: 'physical',
        label: node.hostname,
        kind: 'infra-node',
        x: 80,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
      {
        id: portId,
        layer: 'physical',
        label: `Port-${index + 1}`,
        kind: 'port',
        x: 320,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
      {
        id: switchId,
        layer: 'physical',
        label: switchName,
        kind: 'switch',
        x: 560,
        y: 100 + index * 120,
        metadata: { rack, namespace, service, switch: switchName },
      },
    );

    graphEdges.push(
      { id: `edge:${k8sNodeId}->${serviceId}`, from: k8sNodeId, to: serviceId, layer: 'k8s', type: 'service-route' },
      { id: `edge:${serviceId}->${podId}`, from: serviceId, to: podId, layer: 'k8s', type: 'service-route' },
      { id: `edge:${infraNodeId}->${portId}`, from: infraNodeId, to: portId, layer: 'physical', type: 'uplink' },
      { id: `edge:${portId}->${switchId}`, from: portId, to: switchId, layer: 'physical', type: 'uplink' },
      { id: `edge:${k8sNodeId}->${infraNodeId}`, from: k8sNodeId, to: infraNodeId, layer: 'physical', type: 'runs-on', label: 'schedule' },
    );
  });

  const dedupedSwitches = new Map<string, GraphNode>();
  graphNodes.forEach(node => {
    if (node.kind !== 'switch') return;
    dedupedSwitches.set(node.id, node);
  });

  graphNodes.push(...Array.from(dedupedSwitches.values()));

  return {
    nodes: graphNodes.filter((node, i, arr) => arr.findIndex(n => n.id === node.id) === i),
    edges: [...graphEdges, ...manualEdges],
  };
}

function makeTraceResults(edges: GraphEdge[]): TraceResult[] {
  const physicalEdges = edges.filter(e => e.layer === 'physical');
  if (physicalEdges.length < 2) return [];

  return [
    {
      id: 'trace-east-west',
      name: 'East-West 서비스 경로',
      hops: physicalEdges.slice(0, 3).map((edge, idx) => ({ edgeId: edge.id, latencyMs: 1.2 + idx * 0.8, drops: idx === 2 ? 2 : 0 })),
    },
    {
      id: 'trace-north-south',
      name: 'North-South 외부 통신',
      hops: physicalEdges.slice(1, 4).map((edge, idx) => ({ edgeId: edge.id, latencyMs: 2.1 + idx * 1.1, drops: idx === 1 ? 1 : 0 })),
    },
  ];
}

function nodeStyle(kind: GraphNode['kind']) {
  switch (kind) {
    case 'pod':
      return 'fill-emerald-500/20 stroke-emerald-400';
    case 'service':
      return 'fill-blue-500/20 stroke-blue-400';
    case 'k8s-node':
      return 'fill-cyan-500/20 stroke-cyan-300';
    case 'switch':
      return 'fill-amber-500/20 stroke-amber-400';
    case 'port':
      return 'fill-fuchsia-500/20 stroke-fuchsia-400';
    default:
      return 'fill-purple-500/20 stroke-purple-400';
  }
}

interface GraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedLayers: Record<LayerKey, boolean>;
  highlightedTrace?: TraceResult;
  searchText: string;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (next: { x: number; y: number }) => void;
}

function GraphRenderer({
  nodes,
  edges,
  selectedLayers,
  highlightedTrace,
  searchText,
  zoom,
  pan,
  onPanChange,
}: GraphRendererProps) {
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const traceHopMap = useMemo(() => {
    const map = new Map<string, { order: number; latencyMs: number; drops: number }>();
    highlightedTrace?.hops.forEach((hop, idx) => map.set(hop.edgeId, { order: idx + 1, latencyMs: hop.latencyMs, drops: hop.drops }));
    return map;
  }, [highlightedTrace]);

  const visibleNodes = nodes.filter(node => {
    if (!selectedLayers[node.layer]) return false;
    if (!searchText.trim()) return true;
    return node.label.toLowerCase().includes(searchText.toLowerCase().trim());
  });
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(edge => selectedLayers[edge.layer] && visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to));

  return (
    <div
      className="relative border border-border rounded-xl bg-card overflow-hidden min-h-[560px]"
      onMouseDown={e => setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
      onMouseMove={e => {
        if (!dragStart) return;
        onPanChange({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      }}
      onMouseUp={() => setDragStart(null)}
      onMouseLeave={() => setDragStart(null)}
    >
      <svg className="w-full h-[560px] cursor-grab active:cursor-grabbing" viewBox="0 0 1200 560">
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {LAYER_ORDER.map((layer, idx) => (
            <g key={layer}>
              <rect
                x={layer === 'k8s' ? 20 : 620}
                y={30}
                width={560}
                height={500}
                className={idx === 0 ? 'fill-sky-500/5 stroke-sky-500/20' : 'fill-amber-500/5 stroke-amber-500/20'}
                strokeDasharray="6 6"
              />
              <text
                x={layer === 'k8s' ? 38 : 638}
                y={58}
                className={idx === 0 ? 'fill-sky-300' : 'fill-amber-300'}
                fontSize="14"
              >
                {layer === 'k8s' ? 'K8s 객체 레이어 (Pod/Service/Node)' : '물리 레이어 (Port/Switch/Link)'}
              </text>
            </g>
          ))}

          {visibleEdges.map(edge => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const hop = traceHopMap.get(edge.id);
            return (
              <g key={edge.id}>
                <line
                  x1={from.x + (from.layer === 'k8s' ? 0 : 620)}
                  y1={from.y}
                  x2={to.x + (to.layer === 'k8s' ? 0 : 620)}
                  y2={to.y}
                  className={hop ? 'stroke-lime-400' : 'stroke-slate-500'}
                  strokeWidth={hop ? 3 : 1.5}
                  strokeDasharray={edge.type === 'manual' ? '5 3' : undefined}
                />
                {hop && (
                  <g>
                    <rect
                      x={(from.x + (from.layer === 'k8s' ? 0 : 620) + to.x + (to.layer === 'k8s' ? 0 : 620)) / 2 - 56}
                      y={(from.y + to.y) / 2 - 18}
                      width={112}
                      height={24}
                      className="fill-black/80 stroke-lime-400"
                      rx={6}
                    />
                    <text
                      x={(from.x + (from.layer === 'k8s' ? 0 : 620) + to.x + (to.layer === 'k8s' ? 0 : 620)) / 2}
                      y={(from.y + to.y) / 2 - 2}
                      textAnchor="middle"
                      className="fill-lime-300"
                      fontSize="10"
                    >
                      {`${hop.order} hop · ${hop.latencyMs.toFixed(1)}ms · drop ${hop.drops}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {visibleNodes.map(node => (
            <g key={node.id}>
              <rect
                x={node.x - 48 + (node.layer === 'k8s' ? 0 : 620)}
                y={node.y - 18}
                width={96}
                height={36}
                className={`${nodeStyle(node.kind)} stroke-2`}
                rx={8}
              />
              <text
                x={node.x + (node.layer === 'k8s' ? 0 : 620)}
                y={node.y + 4}
                textAnchor="middle"
                className="fill-foreground"
                fontSize="10"
              >
                {node.label.length > 16 ? `${node.label.slice(0, 14)}..` : node.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

interface NodeCardProps {
  node: InfraNode;
  onEdit: (n: InfraNode) => void;
  onDelete: (n: InfraNode) => void;
}

function NodeCard({ node, onEdit, onDelete }: NodeCardProps) {
  const meta = ROLE_META[node.role];
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2 hover:border-primary/40 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
          <span className="text-sm font-medium text-foreground truncate" title={node.hostname}>{node.hostname}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => onEdit(node)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={() => onDelete(node)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <span className={`inline-flex items-center self-start px-2 py-0.5 rounded text-xs font-medium border ${meta.bg} ${meta.color}`}>{meta.label}</span>
      {node.ipAddress && <p className="text-xs text-muted-foreground font-mono">{node.ipAddress}</p>}
      {(node.cpuCores || node.ramGb || node.diskGb) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {node.cpuCores && <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{node.cpuCores}c</span>}
          {node.ramGb && <span className="flex items-center gap-1"><Database className="w-3 h-3" />{node.ramGb}G</span>}
          {node.diskGb && <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{node.diskGb}G</span>}
        </div>
      )}
    </div>
  );
}

interface NodeModalProps {
  clusterId: string;
  initial?: InfraNode | null;
  onClose: () => void;
}

const EMPTY_FORM: InfraNodeCreate = {
  clusterId: '',
  hostname: '',
  rackName: '',
  ipAddress: '',
  role: 'worker',
  cpuCores: undefined,
  ramGb: undefined,
  diskGb: undefined,
  osInfo: '',
  switchName: '',
  notes: '',
};

function NodeModal({ clusterId, initial, onClose }: NodeModalProps) {
  const isEdit = !!initial;
  const createNode = useCreateInfraNode();
  const updateNode = useUpdateInfraNode();
  const [error, setError] = useState('');
  const [form, setForm] = useState<InfraNodeCreate>(() => {
    if (!initial) return { ...EMPTY_FORM, clusterId };
    return {
      clusterId: initial.clusterId,
      hostname: initial.hostname,
      rackName: initial.rackName ?? '',
      ipAddress: initial.ipAddress ?? '',
      role: initial.role,
      cpuCores: initial.cpuCores ?? undefined,
      ramGb: initial.ramGb ?? undefined,
      diskGb: initial.diskGb ?? undefined,
      osInfo: initial.osInfo ?? '',
      switchName: initial.switchName ?? '',
      notes: initial.notes ?? '',
    };
  });

  function set<K extends keyof InfraNodeCreate>(key: K, val: InfraNodeCreate[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.hostname.trim()) { setError('호스트명은 필수입니다.'); return; }

    try {
      if (isEdit && initial) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { clusterId, ...data } = form;
        await updateNode.mutateAsync({ id: initial.id, data });
      } else {
        await createNode.mutateAsync(form);
      }
      onClose();
    } catch (e) {
      setError(extractError(e));
    }
  }

  const isPending = createNode.isPending || updateNode.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{isEdit ? '노드 수정' : '노드 추가'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <input value={form.hostname} onChange={e => set('hostname', e.target.value)} placeholder="node-01" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.rackName ?? ''} onChange={e => set('rackName', e.target.value)} placeholder="Rack-A1" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
            <input value={form.switchName ?? ''} onChange={e => set('switchName', e.target.value)} placeholder="SW-Core-01" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="relative">
            <select value={form.role} onChange={e => set('role', e.target.value as InfraNodeRole)} className="w-full appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm pr-8">
              {ROLES.map(role => <option key={role} value={role}>{ROLE_META[role].label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          {error && <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"><AlertTriangle className="w-3.5 h-3.5" />{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted text-muted-foreground">취소</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {isEdit ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfraTopologyPage() {
  const { data: clusters = [], isLoading: clustersLoading } = useClusters();
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [selectedLayers, setSelectedLayers] = useState<Record<LayerKey, boolean>>({ k8s: true, physical: true });
  const [mode, setMode] = useState<PageMode>('view');
  const [filters, setFilters] = useState<Filters>({ rack: 'all', switchName: 'all', namespace: 'all', service: 'all' });
  const [searchText, setSearchText] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [manualEdges, setManualEdges] = useState<GraphEdge[]>([]);
  const [manualFrom, setManualFrom] = useState('');
  const [manualTo, setManualTo] = useState('');
  const [selectedTraceId, setSelectedTraceId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InfraNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InfraNode | null>(null);
  const [syncError, setSyncError] = useState('');

  const activeClusterId = selectedClusterId || clusters[0]?.id || '';
  const activeCluster = clusters.find(c => c.id === activeClusterId);
  const { data: nodesResp, isLoading: nodesLoading } = useInfraNodes(activeClusterId ? { clusterId: activeClusterId } : undefined);
  const nodes = useMemo<InfraNode[]>(() => nodesResp?.data ?? [], [nodesResp]);

  const deleteNode = useDeleteInfraNode();
  const syncNodes = useSyncInfraNodes();

  const graph = useMemo(() => topologyFromNodes(nodes, activeCluster?.name || 'cluster', manualEdges), [activeCluster?.name, manualEdges, nodes]);
  const traceResults = useMemo(() => makeTraceResults(graph.edges), [graph.edges]);
  const selectedTrace = traceResults.find(t => t.id === selectedTraceId);

  const filterOptions = useMemo(() => {
    const racks = Array.from(new Set(graph.nodes.map(n => n.metadata?.rack).filter(Boolean) as string[])).sort();
    const switches = Array.from(new Set(graph.nodes.map(n => n.metadata?.switch).filter(Boolean) as string[])).sort();
    const namespaces = Array.from(new Set(graph.nodes.map(n => n.metadata?.namespace).filter(Boolean) as string[])).sort();
    const services = Array.from(new Set(graph.nodes.map(n => n.metadata?.service).filter(Boolean) as string[])).sort();
    return { racks, switches, namespaces, services };
  }, [graph.nodes]);

  const filteredNodes = useMemo(() => {
    return graph.nodes.filter(node => {
      if (filters.rack !== 'all' && node.metadata?.rack !== filters.rack) return false;
      if (filters.switchName !== 'all' && node.metadata?.switch !== filters.switchName) return false;
      if (filters.namespace !== 'all' && node.metadata?.namespace !== filters.namespace) return false;
      if (filters.service !== 'all' && node.metadata?.service !== filters.service) return false;
      return true;
    });
  }, [filters, graph.nodes]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(() => graph.edges.filter(edge => filteredNodeIds.has(edge.from) && filteredNodeIds.has(edge.to)), [filteredNodeIds, graph.edges]);

  async function handleSync() {
    if (!activeClusterId) return;
    setSyncError('');
    try {
      await syncNodes.mutateAsync(activeClusterId);
    } catch (e) {
      setSyncError(extractError(e));
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteNode.mutateAsync(deleteTarget.id);
    } finally {
      setDeleteTarget(null);
    }
  }

  function addManualLink() {
    if (!manualFrom || !manualTo || manualFrom === manualTo) return;
    const edge: GraphEdge = {
      id: `manual:${manualFrom}->${manualTo}`,
      from: manualFrom,
      to: manualTo,
      layer: 'physical',
      type: 'manual',
      label: 'manual-link',
    };
    setManualEdges(prev => (prev.some(e => e.id === edge.id) ? prev : [...prev, edge]));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSearchText('');
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1720px] mx-auto px-8 py-8 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Network className="w-5 h-5 text-primary" /></div>
            <div>
              <h1 className="text-xl font-bold text-foreground">인프라 토폴로지</h1>
              <p className="text-xs text-muted-foreground mt-0.5">노드/엣지/레이어 렌더러 + Trace Overlay</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={!activeClusterId || syncNodes.isPending} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted text-muted-foreground disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${syncNodes.isPending ? 'animate-spin' : ''}`} /> K8s 동기화
            </button>
            <button onClick={() => { setEditTarget(null); setModalOpen(true); }} disabled={!activeClusterId} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" /> 노드 추가
            </button>
          </div>
        </div>

        {clustersLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> 로딩 중...</div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {clusters.map(c => (
                <button key={c.id} onClick={() => setSelectedClusterId(c.id)} className={`px-3 py-1.5 rounded-lg text-xs border ${activeClusterId === c.id ? 'bg-primary/10 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {c.name}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
                <button onClick={() => setMode('view')} className={`px-3 py-1.5 text-xs rounded ${mode === 'view' ? 'bg-background text-foreground' : 'text-muted-foreground'}`}>조회 모드</button>
                <button onClick={() => setMode('edit')} className={`px-3 py-1.5 text-xs rounded ${mode === 'edit' ? 'bg-background text-foreground' : 'text-muted-foreground'}`}>편집 모드</button>
              </div>
            </div>

            {syncError && <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"><AlertTriangle className="w-3.5 h-3.5" />{syncError}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_320px] gap-4">
              <section className="bg-card border border-border rounded-xl p-4 space-y-4">
                <h2 className="text-sm font-semibold">필터 / 탐색</h2>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">클러스터</label>
                  <div className="text-xs text-foreground bg-muted/40 rounded px-2 py-1">{activeCluster?.name ?? '-'}</div>
                </div>
                {([
                  ['rack', '랙', filterOptions.racks],
                  ['switchName', '스위치', filterOptions.switches],
                  ['namespace', '네임스페이스', filterOptions.namespaces],
                  ['service', '서비스', filterOptions.services],
                ] as Array<[keyof Filters, string, string[]]>).map(([key, label, opts]) => (
                  <div className="space-y-1" key={key}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <select value={filters[key]} onChange={e => setFilters(prev => ({ ...prev, [key]: e.target.value }))} className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs">
                      <option value="all">전체</option>
                      {opts.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                ))}

                <div className="space-y-2 pt-2 border-t border-border">
                  <label className="text-xs text-muted-foreground">검색</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 w-3 h-3 text-muted-foreground" />
                    <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="노드/서비스 검색" className="w-full pl-7 pr-2 py-2 bg-background border border-border rounded text-xs" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 rounded border border-border hover:bg-muted"><ZoomIn className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} className="p-1.5 rounded border border-border hover:bg-muted"><ZoomOut className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setPan(p => ({ ...p, x: p.x - 30 }))} className="p-1.5 rounded border border-border hover:bg-muted"><Minus className="w-3.5 h-3.5" /></button>
                    <button onClick={resetView} className="ml-auto px-2 py-1.5 rounded border border-border text-xs hover:bg-muted">Reset</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={selectedLayers.k8s} onChange={e => setSelectedLayers(prev => ({ ...prev, k8s: e.target.checked }))} />K8s 레이어</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={selectedLayers.physical} onChange={e => setSelectedLayers(prev => ({ ...prev, physical: e.target.checked }))} />물리 레이어</label>
                  </div>
                </div>
              </section>

              <section>
                {nodesLoading ? (
                  <div className="h-[560px] border border-border rounded-xl flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <GraphRenderer
                    nodes={filteredNodes}
                    edges={filteredEdges}
                    selectedLayers={selectedLayers}
                    highlightedTrace={mode === 'view' ? selectedTrace : undefined}
                    searchText={searchText}
                    zoom={zoom}
                    pan={pan}
                    onPanChange={setPan}
                  />
                )}
              </section>

              <section className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h2 className="text-sm font-semibold">{mode === 'view' ? 'Trace Overlay' : '수동 링크 편집'}</h2>
                {mode === 'view' ? (
                  <>
                    <select value={selectedTraceId} onChange={e => setSelectedTraceId(e.target.value)} className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs">
                      <option value="">Trace 선택</option>
                      {traceResults.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <div className="space-y-1 max-h-[460px] overflow-auto">
                      {selectedTrace ? selectedTrace.hops.map((hop, idx) => (
                        <div key={hop.edgeId} className="text-xs border border-lime-500/30 bg-lime-500/5 rounded px-2 py-1.5">
                          <div className="font-medium">Hop {idx + 1}</div>
                          <div className="text-muted-foreground">지연 {hop.latencyMs.toFixed(1)}ms · drop {hop.drops}</div>
                        </div>
                      )) : <p className="text-xs text-muted-foreground">운영 추적을 위해 trace를 선택하세요.</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={manualFrom} onChange={e => setManualFrom(e.target.value)} className="bg-background border border-border rounded px-2 py-1.5 text-xs">
                        <option value="">From</option>
                        {graph.nodes.filter(n => n.layer === 'physical').map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                      </select>
                      <select value={manualTo} onChange={e => setManualTo(e.target.value)} className="bg-background border border-border rounded px-2 py-1.5 text-xs">
                        <option value="">To</option>
                        {graph.nodes.filter(n => n.layer === 'physical').map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                      </select>
                    </div>
                    <button onClick={addManualLink} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"><Link2 className="w-3.5 h-3.5" />링크 추가</button>
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {manualEdges.length === 0 ? <p className="text-xs text-muted-foreground">수동 링크가 없습니다.</p> : manualEdges.map(edge => (
                        <div key={edge.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                          <span className="truncate">{edge.from} → {edge.to}</span>
                          <button onClick={() => setManualEdges(prev => prev.filter(e => e.id !== edge.id))} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>

                    <div className="pt-3 border-t border-border space-y-2 max-h-[260px] overflow-auto">
                      <h3 className="text-xs text-muted-foreground">노드 인벤토리</h3>
                      {nodes.map(node => (
                        <NodeCard key={node.id} node={node} onEdit={n => { setEditTarget(n); setModalOpen(true); }} onDelete={setDeleteTarget} />
                      ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {modalOpen && activeClusterId && <NodeModal clusterId={activeClusterId} initial={editTarget} onClose={() => { setModalOpen(false); setEditTarget(null); }} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-500/10"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <p className="text-sm font-semibold text-foreground">노드 삭제</p>
                <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground">{deleteTarget.hostname}</span>을 삭제하시겠습니까?</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted text-muted-foreground">취소</button>
              <button onClick={handleDeleteConfirm} disabled={deleteNode.isPending} className="px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { InfraTopologyPage };
