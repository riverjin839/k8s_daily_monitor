import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Map as MapIcon,
  Plus,
  Trash2,
  X,
  Check,
  Edit2,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  GitBranch,
  LayoutGrid,
  Rows3,
  Building2,
  Spline,
  Minus,
  CornerDownRight,
  HelpCircle,
} from 'lucide-react';
import {
  useMindMaps, useMindMap, useCreateMindMap, useUpdateMindMap, useDeleteMindMap,
  useCreateNode, useUpdateNode, useDeleteNode, useBulkUpdatePositions,
} from '@/hooks/useMindMap';
import type { MindMap, MindMapNode } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────
const NODE_COLORS = [
  { label: '기본', value: '' },
  { label: 'Slate', value: '#64748b' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Zinc', value: '#71717a' },
  { label: 'Stone', value: '#78716c' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Sky', value: '#0ea5e9' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Rose', value: '#f43f5e' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Lime', value: '#84cc16' },
  { label: 'Fuchsia', value: '#d946ef' },
];

const BRANCH_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#ec4899', '#ef4444'];

const NODE_W_ROOT = 130;
const NODE_H_ROOT = 44;
const NODE_W = 106;
const NODE_H = 34;
const H_GAP = 150;
const V_GAP = 24;
const LEVEL_GAP = 120;
const SIBLING_GAP = 26;

const BORDER_DASH: Record<NodeBorderStyle, string | undefined> = {
  solid: undefined,
  dashed: '6,3',
  dotted: '2,3',
};

const SIZE_MULTIPLIER: Record<NodeSize, number> = {
  sm: 0.8,
  md: 1,
  lg: 1.25,
};

type LayoutMode = 'mindmap' | 'tree' | 'orgchart';
type ConnStyle = 'bezier' | 'straight' | 'elbow';
type NodeShape = 'rect' | 'rounded' | 'pill' | 'circle' | 'diamond' | 'hexagon' | 'parallelogram' | 'cloud';
type NodeBorderStyle = 'solid' | 'dashed' | 'dotted';
type NodeSize = 'sm' | 'md' | 'lg';

type PosMap = globalThis.Map<string, { x: number; y: number }>;

interface NodeExtra {
  shape?: NodeShape;
  borderStyle?: NodeBorderStyle;
  size?: NodeSize;
}

const NODE_SHAPES: { value: NodeShape; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
  { value: 'circle', label: 'Circle' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'parallelogram', label: 'Parallelogram' },
  { value: 'cloud', label: 'Cloud' },
];

// ── Tree helpers ─────────────────────────────────────────────────────────────
function buildNodeTree(nodes: MindMapNode[]) {
  const byId = new globalThis.Map(nodes.map((n): [string, MindMapNode] => [n.id, n]));
  const children = new globalThis.Map<string | null, MindMapNode[]>();
  for (const n of nodes) {
    const pid = n.parentId ?? null;
    if (!children.has(pid)) children.set(pid, []);
    children.get(pid)!.push(n);
  }
  return { byId, children };
}

function getNodeExtra(node: MindMapNode): NodeExtra {
  return (node.extra ?? {}) as NodeExtra;
}

function nodeDimensions(node: MindMapNode, isRoot: boolean) {
  const baseW = isRoot ? NODE_W_ROOT : NODE_W;
  const baseH = isRoot ? NODE_H_ROOT : NODE_H;
  const extra = getNodeExtra(node);
  const scale = SIZE_MULTIPLIER[extra.size ?? 'md'];
  return { w: baseW * scale, h: baseH * scale };
}

function nodeColor(node: MindMapNode, isRoot: boolean) {
  if (node.color) return node.color;
  return isRoot ? '#6366f1' : '#374151';
}

function rgbaFromHex(hex: string, alpha: number) {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getNodeShapePath(shape: NodeShape, w: number, h: number): string {
  switch (shape) {
    case 'diamond':
      return `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
    case 'hexagon': {
      const inset = Math.max(12, w * 0.16);
      return `${inset},0 ${w - inset},0 ${w},${h / 2} ${w - inset},${h} ${inset},${h} 0,${h / 2}`;
    }
    case 'parallelogram': {
      const skew = Math.max(10, w * 0.14);
      return `${skew},0 ${w},0 ${w - skew},${h} 0,${h}`;
    }
    default:
      return '';
  }
}

function renderNodeShape(shape: NodeShape, w: number, h: number, fill: string, stroke: string, strokeWidth: number, strokeDasharray?: string) {
  const common = { fill, stroke, strokeWidth, strokeDasharray };
  if (shape === 'rect') return <rect width={w} height={h} rx={0} {...common} />;
  if (shape === 'rounded') return <rect width={w} height={h} rx={8} {...common} />;
  if (shape === 'pill') return <rect width={w} height={h} rx={h / 2} {...common} />;
  if (shape === 'circle') return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
  if (shape === 'cloud') {
    const d = [
      `M ${w * 0.1} ${h * 0.6}`,
      `C ${w * 0.03} ${h * 0.58}, ${w * 0.03} ${h * 0.32}, ${w * 0.2} ${h * 0.33}`,
      `C ${w * 0.22} ${h * 0.12}, ${w * 0.42} ${h * 0.08}, ${w * 0.52} ${h * 0.22}`,
      `C ${w * 0.68} ${h * 0.07}, ${w * 0.9} ${h * 0.2}, ${w * 0.82} ${h * 0.4}`,
      `C ${w * 0.95} ${h * 0.44}, ${w * 0.96} ${h * 0.7}, ${w * 0.76} ${h * 0.7}`,
      `L ${w * 0.22} ${h * 0.7}`,
      `C ${w * 0.16} ${h * 0.72}, ${w * 0.08} ${h * 0.7}, ${w * 0.1} ${h * 0.6} Z`,
    ].join(' ');
    return <path d={d} {...common} />;
  }
  return <polygon points={getNodeShapePath(shape, w, h)} {...common} />;
}

function subtreeHeight(nodeId: string, childMap: globalThis.Map<string | null, MindMapNode[]>): number {
  const kids = childMap.get(nodeId) ?? [];
  if (kids.length === 0) return NODE_H + V_GAP;
  return kids.reduce((sum, k) => sum + subtreeHeight(k.id, childMap), 0);
}

function placeBranch(
  nodeId: string,
  parentX: number,
  centerY: number,
  dir: 1 | -1,
  childMap: globalThis.Map<string | null, MindMapNode[]>,
  positions: PosMap,
) {
  const kids = (childMap.get(nodeId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  if (kids.length === 0) return;

  const totalH = kids.reduce((s, k) => s + subtreeHeight(k.id, childMap), 0) - V_GAP;
  let y = centerY - totalH / 2;
  const childX = parentX + dir * H_GAP;

  for (const kid of kids) {
    const kh = subtreeHeight(kid.id, childMap);
    const ky = y + (kh - V_GAP) / 2;
    positions.set(kid.id, { x: childX, y: ky });
    placeBranch(kid.id, childX, ky, dir, childMap, positions);
    y += kh;
  }
}

function mindmapLayout(nodes: MindMapNode[], cx = 600, cy = 400): PosMap {
  const positions: PosMap = new globalThis.Map();
  const { children } = buildNodeTree(nodes);
  const roots = (children.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  if (roots.length === 0) return positions;

  const placeRoot = (root: MindMapNode, rootCx: number, rootCy: number) => {
    positions.set(root.id, { x: rootCx, y: rootCy });
    const kids = (children.get(root.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
    const half = Math.ceil(kids.length / 2);
    const rightKids = kids.slice(0, half);
    const leftKids = kids.slice(half);

    const placeSide = (sideKids: MindMapNode[], dir: 1 | -1) => {
      if (sideKids.length === 0) return;
      const totalH = sideKids.reduce((s, k) => s + subtreeHeight(k.id, children), 0) - V_GAP;
      let y = rootCy - totalH / 2;
      for (const kid of sideKids) {
        const kh = subtreeHeight(kid.id, children);
        const ky = y + (kh - V_GAP) / 2;
        positions.set(kid.id, { x: rootCx + dir * H_GAP, y: ky });
        placeBranch(kid.id, rootCx + dir * H_GAP, ky, dir, children, positions);
        y += kh;
      }
    };

    placeSide(rightKids, 1);
    placeSide(leftKids, -1);
  };

  if (roots.length === 1) {
    placeRoot(roots[0], cx, cy);
  } else {
    const rowH = NODE_H_ROOT + V_GAP;
    const totalH = roots.length * rowH - V_GAP;
    let ry = cy - totalH / 2;
    for (const root of roots) {
      placeRoot(root, cx, ry + NODE_H_ROOT / 2);
      ry += rowH;
    }
  }
  return positions;
}

function computeDownHeight(nodeId: string, childMap: globalThis.Map<string | null, MindMapNode[]>): number {
  const kids = childMap.get(nodeId) ?? [];
  if (kids.length === 0) return NODE_W;
  const sum = kids.reduce((acc, kid) => acc + computeDownHeight(kid.id, childMap), 0) + SIBLING_GAP * (kids.length - 1);
  return Math.max(NODE_W, sum);
}

function placeBranchDown(
  nodeId: string,
  centerX: number,
  y: number,
  childMap: globalThis.Map<string | null, MindMapNode[]>,
  positions: PosMap,
) {
  positions.set(nodeId, { x: centerX, y });
  const kids = (childMap.get(nodeId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  if (kids.length === 0) return;

  const widths = kids.map((k) => computeDownHeight(k.id, childMap));
  const totalW = widths.reduce((a, b) => a + b, 0) + SIBLING_GAP * (kids.length - 1);
  let cursor = centerX - totalW / 2;

  kids.forEach((kid, idx) => {
    const subtreeW = widths[idx];
    const childX = cursor + subtreeW / 2;
    placeBranchDown(kid.id, childX, y + LEVEL_GAP, childMap, positions);
    cursor += subtreeW + SIBLING_GAP;
  });
}

function treeLayout(nodes: MindMapNode[], cx = 600, cy = 120): PosMap {
  const positions: PosMap = new globalThis.Map();
  const { children } = buildNodeTree(nodes);
  const roots = (children.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  if (roots.length === 0) return positions;

  const widths = roots.map((r) => computeDownHeight(r.id, children));
  const totalW = widths.reduce((a, b) => a + b, 0) + SIBLING_GAP * (roots.length - 1);
  let cursor = cx - totalW / 2;

  roots.forEach((root, idx) => {
    const subtreeW = widths[idx];
    const x = cursor + subtreeW / 2;
    placeBranchDown(root.id, x, cy, children, positions);
    cursor += subtreeW + SIBLING_GAP;
  });

  return positions;
}

function orgChartLayout(nodes: MindMapNode[], cx = 600, cy = 120): PosMap {
  return treeLayout(nodes, cx, cy);
}

function getBranchColor(nodeId: string, nodes: MindMapNode[]) {
  const { byId, children } = buildNodeTree(nodes);
  const roots = (children.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const root = roots[0];
  if (!root) return '#6366f1';

  const rootKids = (children.get(root.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  const branchIndex = new globalThis.Map(rootKids.map((kid, idx) => [kid.id, idx % BRANCH_COLORS.length]));

  let cur = byId.get(nodeId);
  while (cur && cur.parentId) {
    if (cur.parentId === root.id) return BRANCH_COLORS[branchIndex.get(cur.id) ?? 0];
    cur = byId.get(cur.parentId);
  }
  return '#6366f1';
}

// ── Node Editor ──────────────────────────────────────────────────────────────
interface NodeEditorValue {
  label: string;
  note: string;
  color: string;
  shape: NodeShape;
  borderStyle: NodeBorderStyle;
  size: NodeSize;
}

interface NodeEditorProps {
  initial: NodeEditorValue | null;
  onSave: (value: NodeEditorValue) => void;
  onClose: () => void;
  title: string;
}

function NodeEditor({ initial, onSave, onClose, title }: NodeEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [color, setColor] = useState(initial?.color ?? '');
  const [shape, setShape] = useState<NodeShape>(initial?.shape ?? 'rounded');
  const [borderStyle, setBorderStyle] = useState<NodeBorderStyle>(initial?.borderStyle ?? 'solid');
  const [size, setSize] = useState<NodeSize>(initial?.size ?? 'md');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      note: note.trim(),
      color,
      shape,
      borderStyle,
      size,
    });
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-lg shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">노드 이름 *</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="노드 이름을 입력하세요" className={inputClass} autoFocus required />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">메모 (선택)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="부연 설명이나 메모" rows={3} className={`${inputClass} resize-none`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">색상</label>
            <div className="grid grid-cols-5 gap-2">
              {NODE_COLORS.map((c) => (
                <button
                  key={`${c.label}-${c.value}`}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    color === c.value ? 'scale-125 border-white' : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value || '#9ca3af' }}
                  title={c.label}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Custom</span>
              <input type="color" value={color || '#6366f1'} onChange={(e) => setColor(e.target.value)} className="w-10 h-6 bg-transparent" />
              <button type="button" onClick={() => setColor('')} className="text-xs px-2 py-1 border border-border rounded-md hover:bg-secondary">기본</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">모양</label>
            <div className="grid grid-cols-4 gap-2">
              {NODE_SHAPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setShape(s.value)}
                  className={`p-2 border rounded-lg flex flex-col items-center gap-1 text-[10px] ${shape === s.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/70'}`}
                >
                  <svg width="42" height="24" viewBox="0 0 42 24">
                    <g transform="translate(1,1)">
                      {renderNodeShape(s.value, 40, 22, 'rgba(99,102,241,0.15)', '#6366f1', 1.2)}
                    </g>
                  </svg>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">테두리</label>
              <div className="flex gap-1">
                {(['solid', 'dashed', 'dotted'] as NodeBorderStyle[]).map((b) => (
                  <button key={b} type="button" onClick={() => setBorderStyle(b)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-md border ${borderStyle === b ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">크기</label>
              <div className="flex gap-1">
                {(['sm', 'md', 'lg'] as NodeSize[]).map((s) => (
                  <button key={s} type="button" onClick={() => setSize(s)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-md border ${size === s ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'}`}>
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
              취소
            </button>
            <button type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Canvas ───────────────────────────────────────────────────────────────────
interface CanvasProps {
  mindmap: MindMap;
  onNodeSelect: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  onAddChild: (parentId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onEditNode: (node: MindMapNode) => void;
  onDeleteNode: (nodeId: string) => void;
}

function MindMapCanvas({
  mindmap,
  onNodeSelect,
  selectedNodeId,
  onAddChild,
  onAddSibling,
  onEditNode,
  onDeleteNode,
}: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('mindmap');
  const [connStyle, setConnStyle] = useState<ConnStyle>('bezier');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [hoverShortcut, setHoverShortcut] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<PosMap>(new globalThis.Map());
  const bulkUpdate = useBulkUpdatePositions(mindmap.id);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodes = mindmap.nodes;
  const { byId, children: childMap } = useMemo(() => buildNodeTree(nodes), [nodes]);

  const getLayout = useCallback((targetNodes: MindMapNode[]) => {
    if (layoutMode === 'tree') return treeLayout(targetNodes, 600, 120);
    if (layoutMode === 'orgchart') return orgChartLayout(targetNodes, 600, 120);
    return mindmapLayout(targetNodes);
  }, [layoutMode]);

  useEffect(() => {
    if (nodes.length === 0) { setNodePositions(new globalThis.Map()); return; }
    const layout = getLayout(nodes);
    const map = new globalThis.Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      if (n.x != null && n.y != null) map.set(n.id, { x: n.x, y: n.y });
      else map.set(n.id, layout.get(n.id) ?? { x: 600, y: 400 });
    }
    setNodePositions(map);
  }, [nodes, getLayout]);

  const handleAutoLayout = () => {
    if (nodes.length === 0) return;
    const newPositions = getLayout(nodes);
    setNodePositions(newPositions);
    const updates = Array.from(newPositions.entries()).map(([id, pos]) => ({ id, ...pos }));
    bulkUpdate.mutate(updates);
  };

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getPos = (nodeId: string) => nodePositions.get(nodeId) ?? { x: 400, y: 300 };
  const rootIds = new Set((childMap.get(null) ?? []).map((n) => n.id));

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
    }
  };

  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, [isPanning]);

  const handleSvgMouseUp = () => {
    setIsPanning(false);
    if (!dragNodeId) return;
    setDragNodeId(null);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const updates = Array.from(nodePositions.entries()).map(([id, pos]) => ({ id, ...pos }));
      bulkUpdate.mutate(updates);
    }, 800);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.2, z - e.deltaY * 0.001)));
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDragNodeId(nodeId);
    onNodeSelect(nodeId);
  };

  const handleNodeMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragNodeId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    setNodePositions((prev) => new globalThis.Map(prev).set(dragNodeId, { x, y }));
  }, [dragNodeId, pan, zoom]);

  const navigateToNearest = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    if (!selectedNodeId) return;
    const from = nodePositions.get(selectedNodeId) ?? { x: 400, y: 300 };
    let bestId: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      if (node.id === selectedNodeId) continue;
      const p = nodePositions.get(node.id) ?? { x: 400, y: 300 };
      const dx = p.x - from.x;
      const dy = p.y - from.y;
      const valid =
        (direction === 'left' && dx < 0) ||
        (direction === 'right' && dx > 0) ||
        (direction === 'up' && dy < 0) ||
        (direction === 'down' && dy > 0);
      if (!valid) continue;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = node.id;
      }
    }

    if (bestId) onNodeSelect(bestId);
  }, [selectedNodeId, nodes, onNodeSelect, nodePositions]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(3, z + 0.1));
        return;
      }

      if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => Math.max(0.2, z - 0.1));
        return;
      }

      if (e.key === '0') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) fitToScreen();
        else setZoom(1);
        return;
      }

      if (!selectedNodeId) {
        if (e.key === 'Escape') onNodeSelect(null);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        onAddChild(selectedNodeId);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onAddSibling(selectedNodeId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteNode(selectedNodeId);
      } else if (e.key === 'F2') {
        e.preventDefault();
        const node = byId.get(selectedNodeId);
        if (node) onEditNode(node);
      } else if (e.key === 'Escape') {
        onNodeSelect(null);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateToNearest('left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateToNearest('right');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateToNearest('up');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateToNearest('down');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeId, onAddChild, onAddSibling, onDeleteNode, onEditNode, onNodeSelect, byId, navigateToNearest]);

  const getEdgePath = (x1: number, y1: number, x2: number, y2: number) => {
    if (connStyle === 'straight') return `M ${x1} ${y1} L ${x2} ${y2}`;
    if (connStyle === 'elbow') {
      const mid = (x1 + x2) / 2;
      return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
    }
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
  };

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))} className="p-1.5 hover:bg-secondary rounded" title="확대"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))} className="p-1.5 hover:bg-secondary rounded" title="축소"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={fitToScreen} className="p-1.5 hover:bg-secondary rounded" title="리셋"><Maximize2 className="w-4 h-4" /></button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={handleAutoLayout} className="p-1.5 hover:bg-secondary rounded" title="자동 배치"><GitBranch className="w-4 h-4" /></button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={() => setLayoutMode('mindmap')} className={`p-1.5 rounded ${layoutMode === 'mindmap' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Mindmap"><LayoutGrid className="w-4 h-4" /></button>
        <button onClick={() => setLayoutMode('tree')} className={`p-1.5 rounded ${layoutMode === 'tree' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Tree"><Rows3 className="w-4 h-4" /></button>
        <button onClick={() => setLayoutMode('orgchart')} className={`p-1.5 rounded ${layoutMode === 'orgchart' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Org Chart"><Building2 className="w-4 h-4" /></button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={() => setConnStyle('bezier')} className={`p-1.5 rounded ${connStyle === 'bezier' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Bezier"><Spline className="w-4 h-4" /></button>
        <button onClick={() => setConnStyle('straight')} className={`p-1.5 rounded ${connStyle === 'straight' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Straight"><Minus className="w-4 h-4" /></button>
        <button onClick={() => setConnStyle('elbow')} className={`p-1.5 rounded ${connStyle === 'elbow' ? 'bg-primary/15 text-primary' : 'hover:bg-secondary'}`} title="Elbow"><CornerDownRight className="w-4 h-4" /></button>
        <span className="text-xs text-muted-foreground px-1">{Math.round(zoom * 100)}%</span>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab"
        style={{ cursor: isPanning ? 'grabbing' : dragNodeId ? 'grabbing' : 'grab' }}
        onMouseDown={handleSvgMouseDown}
        onMouseMove={(e) => { handleSvgMouseMove(e); handleNodeMouseMove(e); }}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
        onWheel={handleWheel}
        onClick={(e) => {
          const tag = (e.target as SVGElement).tagName;
          if (tag === 'svg' || tag === 'rect') onNodeSelect(null);
        }}
      >
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {nodes.map((node) => {
            if (!node.parentId) return null;
            const parent = byId.get(node.parentId);
            if (!parent) return null;
            const from = getPos(parent.id);
            const to = getPos(node.id);
            const parentRoot = rootIds.has(parent.id);
            const childRoot = rootIds.has(node.id);
            const pDims = nodeDimensions(parent, parentRoot);
            const cDims = nodeDimensions(node, childRoot);

            let x1 = from.x;
            let y1 = from.y;
            let x2 = to.x;
            let y2 = to.y;

            if (layoutMode === 'mindmap') {
              const goRight = to.x >= from.x;
              x1 = goRight ? from.x + pDims.w / 2 : from.x - pDims.w / 2;
              x2 = goRight ? to.x - cDims.w / 2 : to.x + cDims.w / 2;
            } else {
              x1 = from.x;
              y1 = from.y + pDims.h / 2;
              x2 = to.x;
              y2 = to.y - cDims.h / 2;
            }

            const branchColor = getBranchColor(node.id, nodes);
            return (
              <path
                key={`edge-${node.id}`}
                d={getEdgePath(x1, y1, x2, y2)}
                fill="none"
                stroke={rgbaFromHex(branchColor, 0.5)}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {nodes.map((node) => {
            const pos = getPos(node.id);
            const isRoot = rootIds.has(node.id);
            const isSelected = selectedNodeId === node.id;
            const color = nodeColor(node, isRoot);
            const kids = childMap.get(node.id) ?? [];
            const extra = getNodeExtra(node);
            const { w: nodeW, h: nodeH } = nodeDimensions(node, isRoot);
            const shape = extra.shape ?? 'rounded';
            const strokeDasharray = BORDER_DASH[extra.borderStyle ?? 'solid'];

            return (
              <g key={node.id}
                transform={`translate(${pos.x - nodeW / 2},${pos.y - nodeH / 2})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
              >
                {renderNodeShape(
                  shape,
                  nodeW,
                  nodeH,
                  rgbaFromHex(color, 0.15),
                  color,
                  isSelected ? 2.5 : 1.5,
                  strokeDasharray,
                )}

                <text
                  x={nodeW / 2}
                  y={nodeH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isRoot ? 12 : 11}
                  fontWeight={isRoot ? '600' : '400'}
                  fill={color}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                </text>

                {kids.length > 0 && (
                  <g transform={`translate(${nodeW - 14}, -6)`}>
                    <circle r="8" fill={color} fillOpacity={0.8} />
                    <text x="0" y="0" textAnchor="middle" dominantBaseline="middle"
                      fontSize="8" fill="white" fontWeight="600" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {kids.length}
                    </text>
                  </g>
                )}

                {isSelected && (
                  <g>
                    <g transform={`translate(${nodeW + 4}, ${nodeH / 2 - 20})`} onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }} style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#6366f1" fillOpacity={0.9} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fontSize="12" fill="white" style={{ pointerEvents: 'none' }}>+</text>
                    </g>
                    <g transform={`translate(${nodeW + 4}, ${nodeH / 2})`} onClick={(e) => { e.stopPropagation(); onAddSibling(node.id); }} style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#2563eb" fillOpacity={0.9} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="white" style={{ pointerEvents: 'none' }}>↔</text>
                    </g>
                    <g transform={`translate(${nodeW + 4}, ${nodeH / 2 + 20})`} onClick={(e) => { e.stopPropagation(); onEditNode(node); }} style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#374151" fillOpacity={0.9} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="white" style={{ pointerEvents: 'none' }}>✎</text>
                    </g>
                    <g transform={`translate(${nodeW / 2}, ${nodeH + 12})`} onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }} style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#ef4444" fillOpacity={0.8} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="white" style={{ pointerEvents: 'none' }}>✕</text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-4 right-4">
        <button
          onClick={() => setShowShortcuts((s) => !s)}
          onMouseEnter={() => setHoverShortcut(true)}
          onMouseLeave={() => setHoverShortcut(false)}
          className="p-2 rounded-full border border-border bg-card shadow hover:bg-secondary"
          title="단축키 도움말 (?)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {(showShortcuts || hoverShortcut) && (
        <div className="absolute bottom-14 right-4 bg-card border border-border rounded-lg p-3 text-xs shadow-xl w-64 z-20">
          <p className="font-semibold mb-2">Keyboard Shortcuts</p>
          <div className="space-y-1 text-muted-foreground">
            <p>Tab: 자식 노드 추가</p>
            <p>Enter: 형제 노드 추가</p>
            <p>Delete/Backspace: 노드 삭제</p>
            <p>F2: 노드 수정</p>
            <p>Esc: 선택 해제</p>
            <p>←→↑↓: 인접 노드 이동</p>
            <p>+/=: 확대, -: 축소</p>
            <p>0: 100%, Ctrl+0: 화면 맞춤</p>
            <p>?: 도움말 토글</p>
          </div>
        </div>
      )}

      {selectedNodeId && (() => {
        const node = nodes.find((n) => n.id === selectedNodeId);
        if (!node?.note) return null;
        return (
          <div className="absolute bottom-4 left-4 bg-card border border-border rounded-lg px-4 py-3 max-w-sm shadow-lg">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{node.label}</p>
            <p className="text-sm whitespace-pre-wrap">{node.note}</p>
          </div>
        );
      })()}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export function MindMapPage() {
  const { data: maps = [], isLoading: mapsLoading } = useMindMaps();
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const { data: currentMap } = useMindMap(selectedMapId);
  const createMap = useCreateMindMap();
  const updateMap = useUpdateMindMap();
  const deleteMap = useDeleteMindMap();
  const createNode = useCreateNode(selectedMapId ?? '');
  const updateNode = useUpdateNode(selectedMapId ?? '');
  const deleteNode = useDeleteNode(selectedMapId ?? '');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCreateMap, setShowCreateMap] = useState(false);
  const [editingMapTitle, setEditingMapTitle] = useState('');
  const [nodeEditorState, setNodeEditorState] = useState<{
    mode: 'create' | 'edit';
    parentId?: string;
    node?: MindMapNode;
  } | null>(null);

  useEffect(() => {
    if (maps.length > 0 && !selectedMapId) setSelectedMapId(maps[0].id);
  }, [maps, selectedMapId]);

  const handleCreateMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapTitle.trim()) return;
    const m = await createMap.mutateAsync({ title: editingMapTitle.trim() });
    setSelectedMapId(m.id);
    setShowCreateMap(false);
    setEditingMapTitle('');
  };

  const handleDeleteMap = (mapId: string) => {
    if (!confirm('마인드맵을 삭제하시겠습니까? 모든 노드가 삭제됩니다.')) return;
    deleteMap.mutate(mapId);
    if (selectedMapId === mapId) setSelectedMapId(maps.find((m) => m.id !== mapId)?.id ?? null);
  };

  const handleAddRootNode = () => {
    if (!selectedMapId) return;
    setNodeEditorState({ mode: 'create', parentId: undefined });
  };

  const handleAddChild = (parentId: string) => {
    setNodeEditorState({ mode: 'create', parentId });
  };

  const handleAddSibling = (nodeId: string) => {
    const selected = currentMap?.nodes.find((n) => n.id === nodeId);
    if (!selected) return;
    setNodeEditorState({ mode: 'create', parentId: selected.parentId ?? undefined });
  };

  const handleEditNode = (node: MindMapNode) => {
    setNodeEditorState({ mode: 'edit', node });
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!selectedMapId) return;
    const hasChildren = currentMap?.nodes.some((n) => n.parentId === nodeId);
    if (hasChildren && !confirm('자식 노드도 모두 삭제됩니다. 계속하시겠습니까?')) return;
    deleteNode.mutate(nodeId);
    setSelectedNodeId(null);
  };

  const handleNodeSave = (value: NodeEditorValue) => {
    if (!selectedMapId || !nodeEditorState) return;
    const extra = { shape: value.shape, borderStyle: value.borderStyle, size: value.size };

    if (nodeEditorState.mode === 'create') {
      createNode.mutate({
        mindmapId: selectedMapId,
        parentId: nodeEditorState.parentId ?? null,
        label: value.label,
        note: value.note || undefined,
        color: value.color || undefined,
        extra,
      });
    } else if (nodeEditorState.mode === 'edit' && nodeEditorState.node) {
      updateNode.mutate({
        nodeId: nodeEditorState.node.id,
        data: { label: value.label, note: value.note || undefined, color: value.color || undefined, extra },
      });
    }
    setNodeEditorState(null);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">마인드맵</span>
          </div>
          <button onClick={() => { setShowCreateMap(true); setEditingMapTitle(''); }} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground" title="새 마인드맵">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showCreateMap && (
          <form onSubmit={handleCreateMap} className="px-3 py-2 border-b border-border bg-muted/10">
            <input type="text" value={editingMapTitle} onChange={(e) => setEditingMapTitle(e.target.value)} placeholder="제목 입력 후 Enter" className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary" autoFocus />
            <div className="flex gap-1 mt-1.5">
              <button type="submit" className="flex-1 py-1 text-xs bg-primary text-primary-foreground rounded">생성</button>
              <button type="button" onClick={() => setShowCreateMap(false)} className="flex-1 py-1 text-xs bg-secondary border border-border rounded">취소</button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {mapsLoading ? (
            <p className="text-xs text-muted-foreground text-center py-6">로딩 중...</p>
          ) : maps.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MapIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">마인드맵이 없습니다.</p>
              <button onClick={() => setShowCreateMap(true)} className="mt-2 text-xs text-primary">+ 새로 만들기</button>
            </div>
          ) : (
            maps.map((m) => (
              <div key={m.id} onClick={() => { setSelectedMapId(m.id); setSelectedNodeId(null); }}
                className={`group mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${selectedMapId === m.id ? 'bg-primary/10 text-primary' : 'hover:bg-secondary text-foreground'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.title}</p>
                  <p className="text-[10px] text-muted-foreground">{m.nodeCount}개 노드</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); updateMap.mutate({ id: m.id, data: { title: prompt('새 제목', m.title) ?? m.title } }); }} className="p-1 hover:bg-secondary rounded text-muted-foreground" title="이름 변경"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteMap(m.id); }} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400" title="삭제"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-3 border-b border-border flex items-center gap-3 bg-card">
          {currentMap ? (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{currentMap.title}</span>
              <span className="text-xs text-muted-foreground">{currentMap.nodes.length}개 노드</span>
              <div className="flex-1" />
              <button onClick={handleAddRootNode} className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> 루트 노드 추가
              </button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">마인드맵을 선택하거나 새로 만드세요</span>
          )}
        </div>

        <div className="flex-1 bg-background/50 relative overflow-hidden" style={{ backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          {currentMap ? (
            currentMap.nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MapIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-2">노드가 없습니다.</p>
                  <button onClick={handleAddRootNode} className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg">첫 번째 노드 추가</button>
                </div>
              </div>
            ) : (
              <MindMapCanvas
                mindmap={currentMap}
                selectedNodeId={selectedNodeId}
                onNodeSelect={setSelectedNodeId}
                onAddChild={handleAddChild}
                onAddSibling={handleAddSibling}
                onEditNode={handleEditNode}
                onDeleteNode={handleDeleteNode}
              />
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <MapIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">좌측에서 마인드맵을 선택하세요</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {nodeEditorState && (
        <NodeEditor
          initial={nodeEditorState.mode === 'edit' && nodeEditorState.node
            ? {
              label: nodeEditorState.node.label,
              note: nodeEditorState.node.note ?? '',
              color: nodeEditorState.node.color ?? '',
              shape: ((nodeEditorState.node.extra?.shape as NodeShape) ?? 'rounded'),
              borderStyle: ((nodeEditorState.node.extra?.borderStyle as NodeBorderStyle) ?? 'solid'),
              size: ((nodeEditorState.node.extra?.size as NodeSize) ?? 'md'),
            }
            : null}
          title={nodeEditorState.mode === 'create' ? '노드 추가' : '노드 수정'}
          onSave={handleNodeSave}
          onClose={() => setNodeEditorState(null)}
        />
      )}
    </div>
  );
}
