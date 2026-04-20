declare module 'react-force-graph-3d' {
  import { ComponentType, MutableRefObject } from 'react';
  import { Object3D } from 'three';

  export interface NodeObject {
    id: string | number;
    x?: number;
    y?: number;
    z?: number;
    [key: string]: unknown;
  }

  export interface LinkObject {
    source: string | number | NodeObject;
    target: string | number | NodeObject;
    [key: string]: unknown;
  }

  export interface GraphData {
    nodes: NodeObject[];
    links: LinkObject[];
  }

  export interface ForceGraph3DInstance {
    cameraPosition(position: { x?: number; y?: number; z?: number }, lookAt?: { x?: number; y?: number; z?: number }, ms?: number): void;
    zoomToFit(ms?: number, padding?: number): void;
    d3Force(forceName: string, force?: unknown): unknown;
    refresh(): void;
    scene(): import('three').Scene;
    camera(): import('three').Camera;
    renderer(): import('three').WebGLRenderer;
    controls(): unknown;
    pauseAnimation(): void;
    resumeAnimation(): void;
  }

  export interface ForceGraph3DProps {
    ref?: MutableRefObject<ForceGraph3DInstance | undefined>;
    graphData?: GraphData;
    width?: number;
    height?: number;
    backgroundColor?: string;
    nodeId?: string;
    nodeLabel?: string | ((node: NodeObject) => string);
    nodeColor?: string | ((node: NodeObject) => string);
    nodeVal?: number | string | ((node: NodeObject) => number);
    nodeThreeObject?: ((node: NodeObject) => Object3D) | null;
    nodeThreeObjectExtend?: boolean;
    nodeOpacity?: number;
    linkSource?: string;
    linkTarget?: string;
    linkLabel?: string | ((link: LinkObject) => string);
    linkColor?: string | ((link: LinkObject) => string);
    linkWidth?: number | ((link: LinkObject) => number);
    linkOpacity?: number;
    linkDirectionalArrowLength?: number | ((link: LinkObject) => number);
    linkDirectionalArrowColor?: string | ((link: LinkObject) => string);
    linkDirectionalArrowRelPos?: number;
    linkDirectionalParticles?: number | ((link: LinkObject) => number);
    linkDirectionalParticleSpeed?: number;
    linkDirectionalParticleColor?: string | ((link: LinkObject) => string);
    linkCurvature?: number | ((link: LinkObject) => number);
    onNodeClick?: (node: NodeObject, event: MouseEvent) => void;
    onNodeHover?: (node: NodeObject | null, prevNode: NodeObject | null) => void;
    onLinkClick?: (link: LinkObject, event: MouseEvent) => void;
    enableNodeDrag?: boolean;
    enableNavigationControls?: boolean;
    showNavInfo?: boolean;
    d3AlphaDecay?: number;
    d3VelocityDecay?: number;
    warmupTicks?: number;
    cooldownTicks?: number;
    cooldownTime?: number;
    onEngineStop?: () => void;
  }

  const ForceGraph3D: ComponentType<ForceGraph3DProps>;
  export default ForceGraph3D;
}
