import { useState, useMemo } from 'react';
import { Pencil, Trash2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import type { Cluster, ClusterCustomField } from '@/types';
import { useUpdateCluster } from '@/hooks/useCluster';
import { InlineEdit } from '@/components/common';
import { STATUS_STYLE } from './constants';
import { useOperationLevels, levelBadgeClass, levelLabel, levelColor } from '@/hooks/useOperationLevels';
import { ClusterCustomCell } from './ClusterCustomCell';

// ── 노드 IP JSON 에서 bond0/bond1 같은 NIC 별 IP 를 모아 supernet 추정 ───────────
// nodeIps 에 NIC 수집(SSH 기반) 결과의 interfaces[] 가 있을 때만 의미 있음.
// 백엔드의 _infer_node_cidr 와 같은 로직을 클라이언트에서 재구현 — 별도 엔드포인트 호출 없이
// 행 단위로 즉시 표시 가능.
function ipToNum(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map((s) => parseInt(s, 10));
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
function numToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}
/** 주어진 IPv4 들의 최소 공통 supernet (예: ['10.0.0.5','10.0.0.10'] → '10.0.0.0/29').
 *  prefix < 16 (= 너무 넓음) 이면 null. */
function inferCidr(ips: string[]): string | null {
  const nums = ips.map(ipToNum).filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  if (nums.length === 1) return `${numToIp(nums[0] & 0xffffff00)}/24`;
  const common = nums[0];
  let xorAll = 0;
  for (const n of nums) xorAll |= (common ^ n);
  // 가장 높은 다른 비트 위치 찾기 → 공통 prefix 길이.
  let prefix = 32;
  for (let i = 0; i < 32; i++) {
    if ((xorAll >>> i) & 1) prefix = 31 - i;
  }
  prefix = Math.max(0, Math.min(32, prefix));
  if (prefix < 16) return null;
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  const net = (common & mask) >>> 0;
  return `${numToIp(net)}/${prefix}`;
}

interface NodeIpEntry {
  name: string;
  ip?: string;
  ips?: string[];
  external_ip?: string;
  master?: boolean;
  interfaces?: { name: string; ips: string[]; scopes?: string[]; operstate?: string | null }[];
}

/** cluster.nodeIps 에서 bond0/bond1 IP 들을 모아 각 NIC 별 CIDR 을 추정. */
function computeBondCidrs(nodeIpsJson?: string): { bond0?: string; bond1?: string } {
  if (!nodeIpsJson) return {};
  let parsed: NodeIpEntry[];
  try {
    parsed = JSON.parse(nodeIpsJson) as NodeIpEntry[];
  } catch {
    return {};
  }
  const buckets: Record<string, string[]> = { bond0: [], bond1: [] };
  for (const n of parsed) {
    for (const ifc of n.interfaces ?? []) {
      const key = ifc.name?.toLowerCase();
      if (key !== 'bond0' && key !== 'bond1') continue;
      for (const ip of ifc.ips ?? []) buckets[key].push(ip);
    }
  }
  const result: { bond0?: string; bond1?: string } = {};
  if (buckets.bond0.length > 0) result.bond0 = inferCidr(buckets.bond0) ?? undefined;
  if (buckets.bond1.length > 0) result.bond1 = inferCidr(buckets.bond1) ?? undefined;
  return result;
}

interface ClusterTableRowProps {
  cluster: Cluster;
  onEdit: (c: Cluster) => void;
  onDelete: (c: Cluster) => void;
  deletingId: string | null;
  overlapGroupIdx: number | undefined;
  onCilium: (c: Cluster) => void;
  onAutoUpdate: (c: Cluster) => void;
  autoUpdatingId: string | null;
  customFields?: ClusterCustomField[];
  /** 노드 IP 만 수집 (diff 다이얼로그 없이 즉시 적용) */
  onCollectNodeIps?: (c: Cluster) => void;
  collectingNodeIpsId?: string | null;
}

type EditField = null | 'region' | 'operationLevel' | 'cidr' | 'podCidr' | 'svcCidr';

/** 편집 가능 셀 wrapper — 더블클릭 OR hover 시 나타나는 ✏️ 아이콘 클릭으로 진입.
 *  text 선택을 막아 dblclick 이 안정적으로 발화되게 함.
 */
function EditableCell({
  isEditing, onEnter, children, className = '',
}: {
  isEditing: boolean;
  onEnter: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (isEditing) {
    return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
  }
  return (
    <td
      className={`px-3 py-2.5 select-none cursor-pointer relative group hover:bg-primary/5 transition-colors ${className}`}
      onDoubleClick={(e) => { e.preventDefault(); onEnter(); }}
      onClick={(e) => {
        // 더블클릭 안전망 — detail===2 가 dblclick 보다 먼저 들어오므로 무시
        if (e.detail === 2) return;
      }}
      title="더블클릭 또는 ✏️ 클릭으로 수정"
    >
      {children}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEnter(); }}
        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary hover:bg-secondary/80 transition-opacity"
        title="이 셀 수정"
        aria-label="수정"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </td>
  );
}

export function ClusterTableRow({ cluster, onEdit, onDelete, deletingId, overlapGroupIdx, onCilium, onAutoUpdate, autoUpdatingId, customFields = [], onCollectNodeIps, collectingNodeIpsId }: ClusterTableRowProps) {
  const updateCluster = useUpdateCluster();
  const [editingField, setEditingField] = useState<EditField>(null);

  const quickUpdate = (patch: Partial<Cluster>) => {
    updateCluster.mutate({ id: cluster.id, data: patch }, { onSettled: () => setEditingField(null) });
  };
  const st = STATUS_STYLE[cluster.status] ?? STATUS_STYLE.pending;
  const { data: opsLevels } = useOperationLevels();
  const lv = cluster.operationLevel ? levelBadgeClass(levelColor(opsLevels, cluster.operationLevel)) : undefined;
  const bondCidrs = useMemo(() => computeBondCidrs(cluster.nodeIps), [cluster.nodeIps]);

  return (
    <tr className="border-b border-border hover:bg-secondary/20 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
          <span className="font-medium text-sm text-foreground">{cluster.name}</span>
        </div>
        {cluster.hostname && (
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5 ml-4">{cluster.hostname}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${st.badge}`}>{st.label}</span>
      </td>

      {/* 지역 — 인라인 편집 */}
      <EditableCell
        isEditing={editingField === 'region'}
        onEnter={() => setEditingField('region')}
        className="text-sm text-muted-foreground"
      >
        {editingField === 'region' ? (
          <InlineEdit
            value={cluster.region ?? ''}
            onSave={(v) => quickUpdate({ region: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="예: 서울"
            inputClassName="text-sm"
          />
        ) : (cluster.region || <span className="text-muted-foreground/60">-</span>)}
      </EditableCell>

      {/* 운영레벨 — select 인라인 */}
      <EditableCell
        isEditing={editingField === 'operationLevel'}
        onEnter={() => setEditingField('operationLevel')}
      >
        {editingField === 'operationLevel' ? (
          <select
            autoFocus
            value={cluster.operationLevel ?? ''}
            onChange={(e) => quickUpdate({ operationLevel: e.target.value || undefined })}
            onBlur={() => setEditingField(null)}
            className="text-xs bg-background border border-border rounded px-1.5 py-0.5"
          >
            <option value="">—</option>
            {(opsLevels ?? []).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        ) : cluster.operationLevel ? (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${lv}`}>
            {levelLabel(opsLevels, cluster.operationLevel)}
          </span>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      <td className="px-3 py-2.5">
        {cluster.bgpEnabled ? (
          <div>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">BGP</span>
            {cluster.asNumber && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">AS{cluster.asNumber}</p>}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </td>

      {/* Node CIDR */}
      <EditableCell
        isEditing={editingField === 'cidr'}
        onEnter={() => setEditingField('cidr')}
      >
        {editingField === 'cidr' ? (
          <InlineEdit
            value={cluster.cidr ?? ''}
            onSave={(v) => quickUpdate({ cidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="192.168.0.0/24"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.cidr || bondCidrs.bond0 || bondCidrs.bond1 ? (
          <div>
            {cluster.cidr ? (
              <p className="text-xs font-mono text-foreground" title="모든 노드 InternalIP 의 최소 공통 supernet">{cluster.cidr}</p>
            ) : null}
            {(cluster.firstHost || cluster.lastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.firstHost} ~ {cluster.lastHost}</p>
            )}
            {(bondCidrs.bond0 || bondCidrs.bond1) && (
              <div className="mt-1 space-y-0.5 border-t border-border/40 pt-1"
                title="NIC 수집(SSH) 결과의 interfaces[].name === bond0/bond1 IP 들로 추정한 대역">
                {bondCidrs.bond0 && (
                  <p className="text-[10px] font-mono text-cyan-500/80">
                    <span className="text-muted-foreground/70">bond0</span> {bondCidrs.bond0}
                  </p>
                )}
                {bondCidrs.bond1 && (
                  <p className="text-[10px] font-mono text-amber-500/80">
                    <span className="text-muted-foreground/70">bond1</span> {bondCidrs.bond1}
                  </p>
                )}
              </div>
            )}
            {overlapGroupIdx !== undefined && (
              <span className="text-[10px] text-amber-400 flex items-center gap-0.5 mt-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />겹침
              </span>
            )}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      {/* Pod CIDR */}
      <EditableCell
        isEditing={editingField === 'podCidr'}
        onEnter={() => setEditingField('podCidr')}
      >
        {editingField === 'podCidr' ? (
          <InlineEdit
            value={cluster.podCidr ?? ''}
            onSave={(v) => quickUpdate({ podCidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="10.244.0.0/16"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.podCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.podCidr}</p>
            {(cluster.podFirstHost || cluster.podLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.podFirstHost} ~ {cluster.podLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      {/* Service CIDR */}
      <EditableCell
        isEditing={editingField === 'svcCidr'}
        onEnter={() => setEditingField('svcCidr')}
      >
        {editingField === 'svcCidr' ? (
          <InlineEdit
            value={cluster.svcCidr ?? ''}
            onSave={(v) => quickUpdate({ svcCidr: v || undefined })}
            onCancel={() => setEditingField(null)}
            placeholder="10.96.0.0/12"
            inputClassName="text-xs font-mono"
          />
        ) : cluster.svcCidr ? (
          <div>
            <p className="text-xs font-mono text-foreground">{cluster.svcCidr}</p>
            {(cluster.svcFirstHost || cluster.svcLastHost) && (
              <p className="text-[10px] font-mono text-muted-foreground">{cluster.svcFirstHost} ~ {cluster.svcLastHost}</p>
            )}
          </div>
        ) : <span className="text-muted-foreground/60 text-xs">-</span>}
      </EditableCell>

      <td className="px-3 py-2.5 text-sm text-center">
        {cluster.maxPod
          ? <span className="font-mono text-foreground">{cluster.maxPod}</span>
          : <span className="text-muted-foreground/60 text-xs">-</span>}
      </td>
      {/* K8s / Cilium 버전 */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1">
          {cluster.k8sVersion ? (
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-500 border border-sky-500/20 w-fit">
              k8s {cluster.k8sVersion}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 italic">k8s 미수집</span>
          )}
          <button
            type="button"
            onClick={() => onCilium(cluster)}
            title={cluster.ciliumVersion
              ? `Cilium ${cluster.ciliumVersion} — 클릭 시 설정 보기`
              : 'Cilium 버전 미수집 — 클릭 시 cilium-config ConfigMap 으로 조회/설정'}
            className={`text-[11px] font-mono px-1.5 py-0.5 rounded-full border w-fit transition-colors ${
              cluster.ciliumVersion
                ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/20'
                : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80 hover:text-foreground'
            }`}
          >
            {cluster.ciliumVersion ? `cilium ${cluster.ciliumVersion}` : 'cilium 설정 →'}
          </button>
        </div>
      </td>

      {/* 노드 IP 목록 — 노드당 여러 IP (bond0/bond1) + public/private 스코프 표시 */}
      <td className="px-3 py-2.5">
        {(() => {
          if (!cluster.nodeIps) {
            const isCollecting = collectingNodeIpsId === cluster.id;
            return (
              <div className="flex items-center gap-2 text-[11px]">
                {cluster.nodeCount
                  ? <span className="text-muted-foreground">노드 {cluster.nodeCount}개</span>
                  : <span className="text-muted-foreground/60">-</span>}
                {onCollectNodeIps && (
                  <button
                    type="button"
                    onClick={() => onCollectNodeIps(cluster)}
                    disabled={isCollecting}
                    className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50 flex items-center gap-1"
                    title="kubeconfig 로 노드 IP 즉시 수집 (diff 다이얼로그 없이 적용)"
                  >
                    {isCollecting
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> 수집중</>
                      : <>IP 수집</>}
                  </button>
                )}
              </div>
            );
          }
          try {
            const arr = JSON.parse(cluster.nodeIps) as {
              name: string;
              ip?: string;
              ips?: string[];
              externalIp?: string;
              external_ip?: string;
              master?: boolean;
              interfaces?: { name: string; ips: string[]; scopes?: string[]; operstate?: string | null }[];
            }[];
            const shown = arr.slice(0, 4);
            const rest = arr.length - shown.length;
            const multiCount = arr.filter((n) => (n.ips?.length ?? 0) > 1).length;
            const hasIfaces = arr.some((n) => (n.interfaces?.length ?? 0) > 0);
            const pubCount = arr.reduce((s, n) =>
              s + (n.interfaces ?? []).reduce((s2, ifc) =>
                s2 + (ifc.scopes ?? []).filter((sc) => sc === 'public').length, 0), 0);
            return (
              <div className="text-[11px] font-mono space-y-0.5">
                {shown.map((n) => {
                  const ifaces = n.interfaces ?? [];
                  if (ifaces.length > 0) {
                    return (
                      <div key={n.name} className="space-y-0.5"
                        title={`${n.name}${n.externalIp ? ` · ext: ${n.externalIp}` : ''}`}>
                        <div className={`flex items-center gap-1 ${n.master ? 'text-foreground' : 'text-foreground/80'}`}>
                          {n.master && <span className="inline-block w-1 h-1 rounded-full bg-primary align-middle" />}
                          <span className="text-[10px] text-muted-foreground/80 truncate max-w-[120px]">{n.name}</span>
                        </div>
                        {ifaces.map((ifc) => {
                          const scopes = ifc.scopes ?? [];
                          const ips = ifc.ips ?? [];
                          return (
                            <div key={`${n.name}-${ifc.name}`} className="flex items-center gap-1 flex-wrap pl-2">
                              <span className="text-[9px] text-muted-foreground/70">{ifc.name}</span>
                              {ips.map((ip, i) => {
                                const sc = scopes[i] ?? 'unknown';
                                const isPub = sc === 'public';
                                return (
                                  <span key={ip}
                                    className={`text-[10px] px-1 rounded ${
                                      isPub
                                        ? 'bg-amber-500/10 text-amber-500'
                                        : 'bg-sky-500/10 text-sky-500'
                                    }`}
                                    title={isPub ? 'public' : sc}>
                                    {ip}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  // legacy 포맷 — interfaces 없는 경우
                  const ips = n.ips && n.ips.length > 0 ? n.ips : (n.ip ? [n.ip] : []);
                  return (
                    <div key={n.name} className={n.master ? 'text-foreground' : 'text-muted-foreground'}
                      title={`${n.name}${n.externalIp ? ` · ext: ${n.externalIp}` : ''}`}>
                      {n.master && <span className="inline-block w-1 h-1 rounded-full bg-primary mr-1 align-middle" />}
                      {ips.length === 0
                        ? <span className="text-muted-foreground/60">?</span>
                        : ips.length === 1
                          ? ips[0]
                          : (
                            <span>
                              {ips[0]}
                              <span className="text-muted-foreground/60"> +{ips.length - 1}</span>
                            </span>
                          )}
                    </div>
                  );
                })}
                {rest > 0 && <p className="text-muted-foreground/70">+{rest} more</p>}
                <div className="flex items-center gap-2 pt-0.5">
                  {multiCount > 0 && (
                    <span className="text-[10px] text-primary/70" title="노드당 IP 여러 개 (bond0/bond1 등)">
                      다중 IP {multiCount}대
                    </span>
                  )}
                  {pubCount > 0 && (
                    <span className="text-[10px] text-amber-500/80" title="public IP 보유 NIC 수">
                      public {pubCount}건
                    </span>
                  )}
                  {!hasIfaces && (
                    <span className="text-[10px] text-muted-foreground/60" title="NIC 상세 미수집 — 'NIC 수집' 실행 시 채워집니다.">
                      NIC 미수집
                    </span>
                  )}
                </div>
              </div>
            );
          } catch {
            return <p className="text-[10px] font-mono text-muted-foreground truncate">{cluster.nodeIps}</p>;
          }
        })()}
      </td>

      {customFields.map((f) => (
        <td key={f.id} className="px-3 py-2.5 border-l border-primary/10 align-top" style={f.width ? { width: f.width } : undefined}>
          <ClusterCustomCell cluster={cluster} field={f} />
        </td>
      ))}

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button onClick={() => onAutoUpdate(cluster)}
            className={`p-1.5 rounded transition-colors ${
              autoUpdatingId === cluster.id
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
            title={autoUpdatingId === cluster.id
              ? '수집 중지'
              : '재수집(diff 미리보기) — kubeconfig 로 노드 / 버전 / CIDR 등 다시 조회 후 변경분 확인'}>
            {autoUpdatingId === cluster.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => onEdit(cluster)}
            className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
            title="전체 수정 — 이름/지역/운영레벨/메타데이터 등 폼 페이지로 이동">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(cluster)} disabled={deletingId === cluster.id}
            className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400 disabled:opacity-40 transition-colors"
            title="삭제 — 클러스터와 연관된 Addon/Playbook/점검 이력이 함께 제거됩니다">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
