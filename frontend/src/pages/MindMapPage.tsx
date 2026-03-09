import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Map as MapIcon, Plus, Trash2, X, Check, Edit2, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, GitBranch,
} from 'lucide-react';
import {
  useMindMaps, useMindMap, useCreateMindMap, useUpdateMindMap, useDeleteMindMap,
  useCreateNode, useUpdateNode, useDeleteNode, useBulkUpdatePositions,
} from '@/hooks/useMindMap';
import type { MindMap, MindMapNode } from '@/types';

// ── Colors ──────────────────────────────────────────────────────────────────
const NODE_COLORS = [
  { label: '기본', value: '' },
  { label: '파랑', value: '#3b82f6' },
  { label: '초록', value: '#10b981' },
  { label: '보라', value: '#8b5cf6' },
  { label: '주황', value: '#f59e0b' },
  { label: '빨강', value: '#ef4444' },
  { label: '하늘', value: '#06b6d4' },
  { label: '핑크', value: '#ec4899' },
];

// ── Tree helpers ──────────────────────────────────────────────────────────────
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

type PosMap = globalThis.Map<string, { x: number; y: number }>;

// ── Standard mind-map layout ─────────────────────────────────────────────────
const NODE_W_ROOT = 120;
const NODE_H_ROOT = 40;
const NODE_W      = 100;
const NODE_H      = 32;
const H_GAP       = 150;   // horizontal distance between level centers
const V_GAP       = 24;    // vertical gap between sibling subtrees

/** Total vertical space occupied by a subtree (including gaps). */
function subtreeHeight(
  nodeId: string,
  childMap: globalThis.Map<string | null, MindMapNode[]>,
): number {
  const kids = childMap.get(nodeId) ?? [];
  if (kids.length === 0) return NODE_H + V_GAP;
  return kids.reduce((sum, k) => sum + subtreeHeight(k.id, childMap), 0);
}

/** Recursively place a branch in one direction (dir: 1=right, -1=left). */
function placeBranch(
  nodeId: string,
  parentX: number,
  centerY: number,
  dir: 1 | -1,
  childMap: globalThis.Map<string | null, MindMapNode[]>,
  positions: PosMap,
) {
  const kids = (childMap.get(nodeId) ?? []).sort(
    (a: MindMapNode, b: MindMapNode) => a.sortOrder - b.sortOrder,
  );
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
  const positions: PosMap = new globalThis.Map<string, { x: number; y: number }>();
  const { children } = buildNodeTree(nodes);
  const roots = (children.get(null) ?? []).sort(
    (a: MindMapNode, b: MindMapNode) => a.sortOrder - b.sortOrder,
  );
  if (roots.length === 0) return positions;

  const placeRoot = (root: MindMapNode, rootCx: number, rootCy: number) => {
    positions.set(root.id, { x: rootCx, y: rootCy });
    const kids = (children.get(root.id) ?? []).sort(
      (a: MindMapNode, b: MindMapNode) => a.sortOrder - b.sortOrder,
    );
    const half      = Math.ceil(kids.length / 2);
    const rightKids = kids.slice(0, half);
    const leftKids  = kids.slice(half);

    const placeSide = (sideKids: MindMapNode[], dir: 1 | -1) => {
      if (sideKids.length === 0) return;
      const totalH =
        sideKids.reduce((s, k) => s + subtreeHeight(k.id, children), 0) - V_GAP;
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
    const rowH    = (NODE_H_ROOT + V_GAP);
    const totalH  = roots.length * rowH - V_GAP;
    let ry = cy - totalH / 2;
    for (const root of roots) {
      placeRoot(root, cx, ry + NODE_H_ROOT / 2);
      ry += rowH;
    }
  }
  return positions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function nodeColor(node: MindMapNode, isRoot: boolean) {
  if (node.color) return node.color;
  return isRoot ? '#6366f1' : '#374151';
}

// ── Node Editor Modal ─────────────────────────────────────────────────────────
interface NodeEditorProps {
  initial: { label: string; note: string; color: string } | null;
  onSave: (label: string, note: string, color: string) => void;
  onClose: () => void;
  title: string;
}

function NodeEditor({ initial, onSave, onClose, title }: NodeEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [color, setColor] = useState(initial?.color ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    onSave(label.trim(), note.trim(), color);
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-5 w-full max-w-md shadow-xl">
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
            <div className="flex items-center gap-2 flex-wrap">
              {NODE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    color === c.value ? 'scale-125 border-white' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value || '#6b7280' }}
                  title={c.label}
                />
              ))}
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

// ── SVG Canvas ────────────────────────────────────────────────────────────────
interface CanvasProps {
  mindmap: MindMap;
  onNodeSelect: (nodeId: string | null) => void;
  selectedNodeId: string | null;
  onAddChild: (parentId: string) => void;
  onEditNode: (node: MindMapNode) => void;
  onDeleteNode: (nodeId: string) => void;
}

function MindMapCanvas({ mindmap, onNodeSelect, selectedNodeId, onAddChild, onEditNode, onDeleteNode }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<PosMap>(new globalThis.Map<string, { x: number; y: number }>());
  const bulkUpdate = useBulkUpdatePositions(mindmap.id);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodes = mindmap.nodes;
  const { children: childMap } = buildNodeTree(nodes);

  // Initialize / update positions using standard mind-map layout.
  // Nodes that already have DB-saved x/y keep those positions;
  // newly added nodes (no x/y yet) get a computed position.
  useEffect(() => {
    if (nodes.length === 0) { setNodePositions(new globalThis.Map()); return; }
    const layout = mindmapLayout(nodes);
    const map = new globalThis.Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      if (n.x != null && n.y != null) {
        map.set(n.id, { x: n.x, y: n.y });
      } else {
        map.set(n.id, layout.get(n.id) ?? { x: 600, y: 400 });
      }
    }
    setNodePositions(map);
  }, [nodes]);

  const handleAutoLayout = () => {
    if (nodes.length === 0) return;
    const newPositions = mindmapLayout(nodes);
    setNodePositions(newPositions);
    const updates = Array.from(newPositions.entries()).map(([id, pos]: [string, { x: number; y: number }]) => ({ id, ...pos }));
    bulkUpdate.mutate(updates);
  };

  // Pan handlers
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect') {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
    }
  };

  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: panOrigin.current.x + (e.clientX - panStart.current.x),
        y: panOrigin.current.y + (e.clientY - panStart.current.y),
      });
    }
  }, [isPanning]);

  const handleSvgMouseUp = () => {
    setIsPanning(false);
    if (dragNodeId) {
      setDragNodeId(null);
      // save positions debounced
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        const updates = Array.from(nodePositions.entries()).map(([id, pos]: [string, { x: number; y: number }]) => ({ id, ...pos }));
        bulkUpdate.mutate(updates);
      }, 800);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.2, z - e.deltaY * 0.001)));
  };

  // Node drag
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

  const getPos = (nodeId: string) => nodePositions.get(nodeId) ?? { x: 400, y: 300 };
  const rootIds = new Set((childMap.get(null) ?? []).map((n) => n.id));

  return (
    <div className="relative w-full h-full">
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="확대">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}
          className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="축소">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="원본 크기">
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={handleAutoLayout}
          className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors" title="자동 배치">
          <GitBranch className="w-4 h-4" />
        </button>
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
          // Clear selection only when clicking the SVG background (rect or svg itself)
          const tag = (e.target as SVGElement).tagName;
          if (tag === 'svg' || tag === 'rect') onNodeSelect(null);
        }}
      >
        <rect x="0" y="0" width="100%" height="100%" fill="transparent" />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges — curved bezier from parent's side to child's side */}
          {nodes.map((node) => {
            if (!node.parentId) return null;
            const from  = getPos(node.parentId);
            const to    = getPos(node.id);
            const isPRt = rootIds.has(node.parentId);
            const pw    = isPRt ? NODE_W_ROOT : NODE_W;
            const cw    = NODE_W;
            // child is right of parent → exit parent's right, enter child's left
            const goRight = to.x >= from.x;
            const x1  = goRight ? from.x + pw / 2 : from.x - pw / 2;
            const x2  = goRight ? to.x   - cw / 2 : to.x   + cw / 2;
            const mid = (x1 + x2) / 2;
            const d   = `M ${x1} ${from.y} C ${mid} ${from.y} ${mid} ${to.y} ${x2} ${to.y}`;
            return (
              <path
                key={`edge-${node.id}`}
                d={d}
                fill="none"
                stroke="rgba(99,102,241,0.40)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = getPos(node.id);
            const isRoot = rootIds.has(node.id);
            const isSelected = selectedNodeId === node.id;
            const color = nodeColor(node, isRoot);
            const kids = childMap.get(node.id) ?? [];
            const nodeW = isRoot ? NODE_W_ROOT : NODE_W;
            const nodeH = isRoot ? NODE_H_ROOT : NODE_H;

            return (
              <g key={node.id}
                transform={`translate(${pos.x - nodeW / 2},${pos.y - nodeH / 2})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  width={nodeW} height={nodeH}
                  rx={isRoot ? 20 : 8}
                  fill={color}
                  fillOpacity={0.15}
                  stroke={color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeOpacity={isSelected ? 1 : 0.7}
                />
                <text
                  x={nodeW / 2} y={nodeH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isRoot ? 12 : 11}
                  fontWeight={isRoot ? '600' : '400'}
                  fill={color}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {node.label.length > 16 ? node.label.slice(0, 14) + '…' : node.label}
                </text>

                {/* child count badge */}
                {kids.length > 0 && (
                  <g transform={`translate(${nodeW - 14}, -6)`}>
                    <circle r="8" fill={color} fillOpacity={0.8} />
                    <text x="0" y="0" textAnchor="middle" dominantBaseline="middle"
                      fontSize="8" fill="white" fontWeight="600"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {kids.length}
                    </text>
                  </g>
                )}

                {/* Action buttons (shown when selected) */}
                {isSelected && (
                  <g>
                    {/* Add child */}
                    <g transform={`translate(${nodeW + 4}, ${nodeH / 2 - 10})`}
                      onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
                      style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#6366f1" fillOpacity={0.9} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle"
                        fontSize="12" fill="white" style={{ pointerEvents: 'none' }}>+</text>
                    </g>
                    {/* Edit */}
                    <g transform={`translate(${nodeW + 4}, ${nodeH / 2 + 12})`}
                      onClick={(e) => { e.stopPropagation(); onEditNode(node); }}
                      style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#374151" fillOpacity={0.9} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle"
                        fontSize="10" fill="white" style={{ pointerEvents: 'none' }}>✎</text>
                    </g>
                    {/* Delete */}
                    <g transform={`translate(${nodeW / 2}, ${nodeH + 12})`}
                      onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
                      style={{ cursor: 'pointer' }}>
                      <circle r="9" fill="#ef4444" fillOpacity={0.8} />
                      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle"
                        fontSize="10" fill="white" style={{ pointerEvents: 'none' }}>✕</text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Selected node note */}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
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
    if (maps.length > 0 && !selectedMapId) {
      setSelectedMapId(maps[0].id);
    }
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

  const handleNodeSave = (label: string, note: string, color: string) => {
    if (!selectedMapId || !nodeEditorState) return;
    if (nodeEditorState.mode === 'create') {
      createNode.mutate({
        mindmapId: selectedMapId,
        parentId: nodeEditorState.parentId ?? null,
        label,
        note: note || undefined,
        color: color || undefined,
      });
    } else if (nodeEditorState.mode === 'edit' && nodeEditorState.node) {
      updateNode.mutate({
        nodeId: nodeEditorState.node.id,
        data: { label, note: note || undefined, color: color || undefined },
      });
    }
    setNodeEditorState(null);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar — map list */}
      <aside className="w-60 flex-shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">마인드맵</span>
          </div>
          <button
            onClick={() => { setShowCreateMap(true); setEditingMapTitle(''); }}
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            title="새 마인드맵"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {showCreateMap && (
          <form onSubmit={handleCreateMap} className="px-3 py-2 border-b border-border bg-muted/10">
            <input
              type="text"
              value={editingMapTitle}
              onChange={(e) => setEditingMapTitle(e.target.value)}
              placeholder="제목 입력 후 Enter"
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <div className="flex gap-1 mt-1.5">
              <button type="submit"
                className="flex-1 py-1 text-xs bg-primary text-primary-foreground rounded">생성</button>
              <button type="button" onClick={() => setShowCreateMap(false)}
                className="flex-1 py-1 text-xs bg-secondary border border-border rounded">취소</button>
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
              <button onClick={() => setShowCreateMap(true)} className="mt-2 text-xs text-primary">
                + 새로 만들기
              </button>
            </div>
          ) : (
            maps.map((m) => (
              <div
                key={m.id}
                onClick={() => { setSelectedMapId(m.id); setSelectedNodeId(null); }}
                className={`group mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                  selectedMapId === m.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-secondary text-foreground'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{m.title}</p>
                  <p className="text-[10px] text-muted-foreground">{m.nodeCount}개 노드</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); updateMap.mutate({ id: m.id, data: { title: prompt('새 제목', m.title) ?? m.title } }); }}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground"
                    title="이름 변경"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteMap(m.id); }}
                    className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"
                    title="삭제"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Canvas area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Canvas toolbar */}
        <div className="px-6 py-3 border-b border-border flex items-center gap-3 bg-card">
          {currentMap ? (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{currentMap.title}</span>
              <span className="text-xs text-muted-foreground">
                {currentMap.nodes.length}개 노드
              </span>
              <div className="flex-1" />
              <button
                onClick={handleAddRootNode}
                className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 루트 노드 추가
              </button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">마인드맵을 선택하거나 새로 만드세요</span>
          )}
        </div>

        {/* Canvas */}
        <div
          className="flex-1 bg-background/50 relative overflow-hidden"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.06) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          {currentMap ? (
            currentMap.nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <MapIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-2">노드가 없습니다.</p>
                  <button
                    onClick={handleAddRootNode}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
                  >
                    첫 번째 노드 추가
                  </button>
                </div>
              </div>
            ) : (
              <MindMapCanvas
                mindmap={currentMap}
                selectedNodeId={selectedNodeId}
                onNodeSelect={setSelectedNodeId}
                onAddChild={handleAddChild}
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

      {/* Node editor modal */}
      {nodeEditorState && (
        <NodeEditor
          initial={nodeEditorState.mode === 'edit' && nodeEditorState.node
            ? { label: nodeEditorState.node.label, note: nodeEditorState.node.note ?? '', color: nodeEditorState.node.color ?? '' }
            : null}
          title={nodeEditorState.mode === 'create' ? '노드 추가' : '노드 수정'}
          onSave={handleNodeSave}
          onClose={() => setNodeEditorState(null)}
        />
      )}
    </div>
  );
}
