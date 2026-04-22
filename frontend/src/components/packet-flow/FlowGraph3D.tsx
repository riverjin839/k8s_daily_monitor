import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraph3DInstance, type NodeObject, type LinkObject } from 'react-force-graph-3d';
import * as THREE from 'three';
import type { TopologyTraceHopV2, HopVerdict } from '@/types';

interface Props {
  hops: TopologyTraceHopV2[];
  onSelectHop: (idx: number | null) => void;
  selectedIndex: number | null;
  width: number;
  height: number;
}

// ── 엔티티 타입 → 색상 ─────────────────────────────────────────────────────

const ENTITY_COLOR: Record<string, string> = {
  external:           '#60a5fa', // blue
  dns:                '#818cf8', // indigo
  ingress_controller: '#a78bfa', // violet
  ingress:            '#c084fc', // purple
  service:            '#34d399', // emerald
  pod:                '#fbbf24', // amber
  node:               '#fb923c', // orange
  switch:             '#f87171', // red-400
  error:              '#ef4444', // red
};

const ENTITY_SIZE: Record<string, number> = {
  external: 12,
  dns: 8,
  ingress_controller: 10,
  ingress: 9,
  service: 10,
  pod: 11,
  node: 10,
  switch: 11,
  error: 8,
};

const VERDICT_LINK: Record<HopVerdict, string> = {
  allow: '#22c55ecc',
  deny:  '#ef4444cc',
  warn:  '#f59e0bcc',
  info:  '#94a3b8bb',
};

interface GNode extends NodeObject {
  id: string;
  label: string;
  entityType: string;
  hopIndex: number;
}
interface GLink extends LinkObject {
  source: string;
  target: string;
  verdict: HopVerdict;
}

function makeNodeMesh(node: NodeObject, selectedIdx: number | null): THREE.Mesh {
  const n = node as GNode;
  const size = ENTITY_SIZE[n.entityType] ?? 8;
  const color = ENTITY_COLOR[n.entityType] ?? '#94a3b8';
  const geo = new THREE.SphereGeometry(size, 20, 20);
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: true,
    opacity: selectedIdx !== null && n.hopIndex !== selectedIdx ? 0.45 : 0.95,
    emissive: selectedIdx === n.hopIndex ? color : '#000000',
    emissiveIntensity: selectedIdx === n.hopIndex ? 0.4 : 0,
  });
  return new THREE.Mesh(geo, mat);
}

export function FlowGraph3D({ hops, onSelectHop, selectedIndex, width, height }: Props) {
  const graphRef = useRef<ForceGraph3DInstance>();

  const graphData = useMemo(() => {
    // 각 hop = 노드. 인접 hop 간에 verdict 기반 edge 생성.
    const nodes: GNode[] = hops.map((h, idx) => ({
      id: `${idx}:${h.entityId}`,
      label: h.name,
      entityType: h.entityType,
      hopIndex: idx,
    }));
    const links: GLink[] = [];
    for (let i = 0; i < hops.length - 1; i++) {
      const curr = hops[i];
      const next = hops[i + 1];
      // next 홉의 verdict 를 edge 색상으로
      links.push({
        source: `${i}:${curr.entityId}`,
        target: `${i + 1}:${next.entityId}`,
        verdict: next.verdict,
      });
    }
    return { nodes, links };
  }, [hops]);

  // 초기 카메라를 왼쪽→오른쪽 플로우처럼 보이게
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 600);
  }, [hops.length]);

  const handleNodeClick = useCallback((n: NodeObject) => {
    onSelectHop((n as GNode).hopIndex);
    if (graphRef.current && n.x !== undefined) {
      graphRef.current.cameraPosition(
        { x: n.x! + 30, y: n.y! + 20, z: n.z! + 70 },
        { x: n.x!, y: n.y!, z: n.z! },
        700,
      );
    }
  }, [onSelectHop]);

  const nodeLabel = useCallback((n: NodeObject) => {
    const node = n as GNode;
    const hop = hops[node.hopIndex];
    return `<div style="background:rgba(0,0,0,0.85);padding:6px 10px;border-radius:6px;font-size:12px;color:#fff;font-family:ui-monospace,monospace">
      <div style="font-weight:600">${node.label}</div>
      <div style="opacity:.7">${hop?.entityType}</div>
      ${hop?.interface ? `<div style="opacity:.6">${hop.interface}</div>` : ''}
      ${hop?.verdict && hop.verdict !== 'info' ? `<div style="color:${VERDICT_LINK[hop.verdict]}">● ${hop.verdict}</div>` : ''}
    </div>`;
  }, [hops]);

  const linkColor = useCallback((l: LinkObject) => VERDICT_LINK[(l as GLink).verdict] ?? VERDICT_LINK.info, []);

  const [nodeObject] = useState(() => (n: NodeObject) => makeNodeMesh(n, selectedIndex));
  // force re-render of meshes when selection changes
  const nodeThreeObject = useCallback((n: NodeObject) => makeNodeMesh(n, selectedIndex), [selectedIndex]);

  return (
    <ForceGraph3D
      ref={graphRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeThreeObject={nodeThreeObject}
      nodeLabel={nodeLabel}
      linkColor={linkColor}
      linkWidth={2}
      linkDirectionalArrowLength={5}
      linkDirectionalArrowRelPos={1}
      linkDirectionalParticles={2}
      onNodeClick={handleNodeClick}
      onEngineStop={() => { void nodeObject; }}
    />
  );
}
