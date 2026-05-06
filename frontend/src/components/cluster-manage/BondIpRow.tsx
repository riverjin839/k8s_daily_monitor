import { extractInterfaceIps, groupInternalIps, parseNodeIps } from './internalIp';
import { IpGroupRow, type IpGroupAccent } from './IpGroupRow';

interface BondIpRowProps {
  cluster: { nodeIps?: string };
  /** 'bond0' | 'bond1' */
  bond: 'bond0' | 'bond1';
}

/**
 * 모든 노드의 `interfaces[].name === bond0|bond1` IP 들을 모아
 * 정규식/Glob 형식으로 묶어 표시. NIC 수집(SSH 기반) 후에만 채워진다.
 */
export function BondIpRow({ cluster, bond }: BondIpRowProps) {
  const entries = parseNodeIps(cluster.nodeIps);
  const ips = extractInterfaceIps(entries, bond);
  const groups = groupInternalIps(ips);
  const accent: IpGroupAccent = bond === 'bond0' ? 'cyan' : 'amber';

  return (
    <IpGroupRow
      label={bond}
      groups={groups}
      totalIps={ips.length}
      accent={accent}
      emptyMessage="미수집 — NIC 수집(SSH) 후 채워집니다"
      hasContent={groups.length > 0}
    />
  );
}
