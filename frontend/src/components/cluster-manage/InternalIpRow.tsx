import type { OverlapColor } from './constants';
import { extractInternalIps, groupInternalIps, parseNodeIps } from './internalIp';
import { IpGroupRow } from './IpGroupRow';

interface InternalIpRowProps {
  /** 표시 대상 클러스터 — `nodeIps` (수집된 InternalIP 목록) + `cidr` (fallback supernet) */
  cluster: { cidr?: string; nodeIps?: string };
  overlapColor?: OverlapColor | null;
}

/**
 * Cluster 카드의 네트워크 탭에서 사용되는 INTERNAL_IP 표시 행.
 *
 * `cluster.nodeIps` 가 있으면 → kubectl InternalIP 들을 정규식/Glob 형식으로 묶어 표시.
 * 비어 있으면 → fallback 으로 수동 입력 CIDR 표시.
 */
export function InternalIpRow({ cluster, overlapColor }: InternalIpRowProps) {
  const entries = parseNodeIps(cluster.nodeIps);
  const ips = extractInternalIps(entries);
  const groups = groupInternalIps(ips);

  const fallback = cluster.cidr ? (
    <p className="text-xs font-mono text-muted-foreground" title="nodeIps 미수집 — 수동 입력된 fallback CIDR">
      <span className="text-muted-foreground/70 text-[10px] mr-1">fallback CIDR</span>
      <span className="text-foreground">{cluster.cidr}</span>
    </p>
  ) : null;

  return (
    <IpGroupRow
      label="INTERNAL_IP"
      groups={groups}
      totalIps={ips.length}
      accent="sky"
      emptyMessage="미수집 — 자동수집(kubectl) 후 노드 InternalIP 가 표시됩니다"
      fallback={fallback}
      hasContent={groups.length > 0 || Boolean(cluster.cidr)}
      calcCidr={cluster.cidr}
      overlapColor={overlapColor}
    />
  );
}
