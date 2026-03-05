import { useState, useMemo } from 'react';
import { Server, Pencil, Trash2, X, ChevronDown, ChevronUp, ArrowUpDown, GripVertical, AlertTriangle } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Cluster, ClusterManageUpdate } from '@/types';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { useLocalOrder } from '@/hooks/useLocalOrder';
import { clustersApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';

// ── 운영레벨 옵션 ────────────────────────────────────────────────────────────
const OPERATION_LEVELS = [
  { value: 'production', label: '운영 (Production)' },
  { value: 'staging', label: '스테이징 (Staging)' },
  { value: 'dev', label: '개발 (Dev)' },
  { value: 'test', label: '테스트 (Test)' },
  { value: 'dr', label: 'DR' },
];

const LEVEL_BADGE: Record<string, string> = {
  production: 'bg-red-500/15 text-red-400 border-red-500/30',
  staging:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  dev:        'bg-blue-500/15 text-blue-400 border-blue-500/30',
  test:       'bg-slate-500/15 text-slate-400 border-slate-500/30',
  dr:         'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

// ── CIDR Overlap Utilities ────────────────────────────────────────────────────
function cidrIpToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function parseCidrRange(cidr: string): { start: number; end: number } | null {
  const match = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;
  const prefix = parseInt(match[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  const octets = match[1].split('.').map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  const ipNum = cidrIpToNum(match[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = (ipNum & mask) >>> 0;
  const broadcastNum = (networkNum | (~mask >>> 0)) >>> 0;
  return { start: networkNum, end: broadcastNum };
}

function cidrsOverlap(cidr1: string, cidr2: string): boolean {
  const r1 = parseCidrRange(cidr1);
  const r2 = parseCidrRange(cidr2);
  if (!r1 || !r2) return false;
  return r1.start <= r2.end && r2.start <= r1.end;
}

const OVERLAP_COLORS = [
  { bg: 'bg-orange-500/10', text: 'text-orange-300', border: 'border-orange-500/40', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500/10', text: 'text-pink-300', border: 'border-pink-500/40', dot: 'bg-pink-400' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-300', border: 'border-cyan-500/40', dot: 'bg-cyan-400' },
  { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/40', dot: 'bg-yellow-400' },
  { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/40', dot: 'bg-violet-400' },
];

// ── 정렬 ─────────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'status' | 'operationLevel' | 'region' | 'nodeCount';

function SortTh({
  label, col, sortKey, sortDir, onSort, className,
}: {
  label: string; col: SortKey; sortKey: SortKey | ''; sortDir: 'asc' | 'desc';
  onSort: (c: SortKey) => void; className?: string;
}) {
  const isActive = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground transition-colors ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive
          ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />
          : <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />}
      </span>
    </th>
  );
}

// ── 모달 ─────────────────────────────────────────────────────────────────────
interface ClusterMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  onSaved: () => void;
}

function ClusterMetaModal({ isOpen, onClose, cluster, onSaved }: ClusterMetaModalProps) {
  const [region, setRegion] = useState(cluster.region ?? '');
  const [operationLevel, setOperationLevel] = useState(cluster.operationLevel ?? '');
  const [nodeCount, setNodeCount] = useState<string>(cluster.nodeCount?.toString() ?? '');
  const [maxPod, setMaxPod] = useState<string>(cluster.maxPod?.toString() ?? '');
  const [hostname, setHostname] = useState(cluster.hostname ?? '');
  // Node CIDR
  const [cidr, setCidr] = useState(cluster.cidr ?? '');
  const [firstHost, setFirstHost] = useState(cluster.firstHost ?? '');
  const [lastHost, setLastHost] = useState(cluster.lastHost ?? '');
  // Pod CIDR
  const [podCidr, setPodCidr] = useState(cluster.podCidr ?? '');
  const [podFirstHost, setPodFirstHost] = useState(cluster.podFirstHost ?? '');
  const [podLastHost, setPodLastHost] = useState(cluster.podLastHost ?? '');
  // Service CIDR
  const [svcCidr, setSvcCidr] = useState(cluster.svcCidr ?? '');
  const [svcFirstHost, setSvcFirstHost] = useState(cluster.svcFirstHost ?? '');
  const [svcLastHost, setSvcLastHost] = useState(cluster.svcLastHost ?? '');
  // NIC
  const [bond0Ip, setBond0Ip] = useState(cluster.bond0Ip ?? '');
  const [bond0Mac, setBond0Mac] = useState(cluster.bond0Mac ?? '');
  const [bond1Ip, setBond1Ip] = useState(cluster.bond1Ip ?? '');
  const [bond1Mac, setBond1Mac] = useState(cluster.bond1Mac ?? '');
  // 기타
  const [ciliumConfig, setCiliumConfig] = useState(cluster.ciliumConfig ?? '');
  const [description, setDescription] = useState(cluster.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: ClusterManageUpdate = {
        region: region.trim() || undefined,
        operationLevel: operationLevel || undefined,
        nodeCount: nodeCount ? Number(nodeCount) : undefined,
        maxPod: maxPod ? Number(maxPod) : undefined,
        hostname: hostname.trim() || undefined,
        cidr: cidr.trim() || undefined,
        firstHost: firstHost.trim() || undefined,
        lastHost: lastHost.trim() || undefined,
        podCidr: podCidr.trim() || undefined,
        podFirstHost: podFirstHost.trim() || undefined,
        podLastHost: podLastHost.trim() || undefined,
        svcCidr: svcCidr.trim() || undefined,
        svcFirstHost: svcFirstHost.trim() || undefined,
        svcLastHost: svcLastHost.trim() || undefined,
        bond0Ip: bond0Ip.trim() || undefined,
        bond0Mac: bond0Mac.trim() || undefined,
        bond1Ip: bond1Ip.trim() || undefined,
        bond1Mac: bond1Mac.trim() || undefined,
        ciliumConfig: ciliumConfig.trim() || undefined,
        description: description.trim() || undefined,
      };
      await clustersApi.update(cluster.id, payload as Record<string, unknown>);
      onSaved();
      onClose();
    } catch {
      setError('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1';
  const sectionClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">클러스터 정보 수정</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{cluster.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 위치 및 운영 정보 */}
          <div>
            <h3 className={sectionClass}>위치 및 운영 정보</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>지역</label>
                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)}
                  placeholder="예: 서울, ap-northeast-2" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>운영레벨</label>
                <select value={operationLevel} onChange={(e) => setOperationLevel(e.target.value)} className={inputClass}>
                  <option value="">— 선택 —</option>
                  {OPERATION_LEVELS.map((lvl) => (
                    <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>호스트명</label>
                <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)}
                  placeholder="예: k8s-prod-master.example.com" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 노드 정보 */}
          <div>
            <h3 className={sectionClass}>노드 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>노드 수</label>
                <input type="number" min="0" value={nodeCount} onChange={(e) => setNodeCount(e.target.value)}
                  placeholder="예: 5" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Max Pod (노드당)</label>
                <input type="number" min="0" value={maxPod} onChange={(e) => setMaxPod(e.target.value)}
                  placeholder="예: 110" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Node CIDR */}
          <div>
            <h3 className={sectionClass}>Node CIDR 대역</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Node CIDR</label>
                <input type="text" value={cidr} onChange={(e) => setCidr(e.target.value)}
                  placeholder="예: 192.168.0.0/24" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>First Host</label>
                <input type="text" value={firstHost} onChange={(e) => setFirstHost(e.target.value)}
                  placeholder="예: 192.168.0.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Last Host</label>
                <input type="text" value={lastHost} onChange={(e) => setLastHost(e.target.value)}
                  placeholder="예: 192.168.0.254" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Pod CIDR */}
          <div>
            <h3 className={sectionClass}>Pod CIDR 대역</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Pod CIDR</label>
                <input type="text" value={podCidr} onChange={(e) => setPodCidr(e.target.value)}
                  placeholder="예: 10.244.0.0/16" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>First Host</label>
                <input type="text" value={podFirstHost} onChange={(e) => setPodFirstHost(e.target.value)}
                  placeholder="예: 10.244.0.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Last Host</label>
                <input type="text" value={podLastHost} onChange={(e) => setPodLastHost(e.target.value)}
                  placeholder="예: 10.244.255.254" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Service CIDR */}
          <div>
            <h3 className={sectionClass}>Service CIDR 대역</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Service CIDR</label>
                <input type="text" value={svcCidr} onChange={(e) => setSvcCidr(e.target.value)}
                  placeholder="예: 10.96.0.0/12" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>First Host</label>
                <input type="text" value={svcFirstHost} onChange={(e) => setSvcFirstHost(e.target.value)}
                  placeholder="예: 10.96.0.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Last Host</label>
                <input type="text" value={svcLastHost} onChange={(e) => setSvcLastHost(e.target.value)}
                  placeholder="예: 10.111.255.254" className={inputClass} />
              </div>
            </div>
          </div>

          {/* NIC 정보 */}
          <div>
            <h3 className={sectionClass}>NIC 정보 (ifconfig)</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/10">
                <p className="text-xs font-semibold text-primary">bond0</p>
                <div>
                  <label className={labelClass}>IP 주소</label>
                  <input type="text" value={bond0Ip} onChange={(e) => setBond0Ip(e.target.value)}
                    placeholder="예: 192.168.0.10/24" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>MAC 주소</label>
                  <input type="text" value={bond0Mac} onChange={(e) => setBond0Mac(e.target.value)}
                    placeholder="예: aa:bb:cc:dd:ee:ff" className={inputClass} />
                </div>
              </div>
              <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/10">
                <p className="text-xs font-semibold text-primary">bond1</p>
                <div>
                  <label className={labelClass}>IP 주소</label>
                  <input type="text" value={bond1Ip} onChange={(e) => setBond1Ip(e.target.value)}
                    placeholder="예: 172.16.0.10/24" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>MAC 주소</label>
                  <input type="text" value={bond1Mac} onChange={(e) => setBond1Mac(e.target.value)}
                    placeholder="예: aa:bb:cc:dd:ee:f0" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* 설정 정보 */}
          <div>
            <h3 className={sectionClass}>설정 정보</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>주요 Cilium 설정</label>
                <textarea value={ciliumConfig} onChange={(e) => setCiliumConfig(e.target.value)}
                  placeholder="예: tunnel: vxlan&#10;kubeProxyReplacement: strict&#10;ipv4NativeRoutingCIDR: 10.0.0.0/8"
                  rows={4} className={`${inputClass} resize-none font-mono text-xs`} />
              </div>
              <div>
                <label className={labelClass}>정보 / 설명</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="클러스터에 대한 추가 정보나 메모를 입력하세요"
                  rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-60">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 상세 정보 모달 ────────────────────────────────────────────────────────────
function CidrBlock({ label, cidr, first, last, color }: {
  label: string; cidr?: string; first?: string; last?: string; color: string;
}) {
  if (!cidr && !first && !last) return null;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${color}`}>
      <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider">{label}</p>
      {cidr && <p className="text-xs font-mono mb-0.5">CIDR: <span className="text-foreground">{cidr}</span></p>}
      {first && <p className="text-xs font-mono mb-0.5">First: <span className="text-foreground">{first}</span></p>}
      {last && <p className="text-xs font-mono">Last: <span className="text-foreground">{last}</span></p>}
    </div>
  );
}

function ClusterDetailModal({ cluster, onClose, onEdit, allClusters }: {
  cluster: Cluster; onClose: () => void; onEdit: () => void; allClusters: Cluster[];
}) {
  const topRows: { label: string; value: string | number | undefined | null }[] = [
    { label: 'API Endpoint', value: cluster.apiEndpoint },
    { label: '상태', value: cluster.status },
    { label: '지역', value: cluster.region },
    { label: '운영레벨', value: cluster.operationLevel },
    { label: '호스트명', value: cluster.hostname },
    { label: '노드 수', value: cluster.nodeCount },
    { label: 'Max Pod', value: cluster.maxPod },
    { label: '등록일', value: cluster.createdAt?.slice(0, 10) },
  ];

  // CIDR 겹침: Node, Pod, Service CIDR 모두 체크
  const allCidrPairs: { thisLabel: string; thisCidr: string; otherCluster: Cluster; otherLabel: string; otherCidr: string }[] = [];
  const cidrTypes: { key: keyof Cluster; label: string }[] = [
    { key: 'cidr', label: 'Node CIDR' },
    { key: 'podCidr', label: 'Pod CIDR' },
    { key: 'svcCidr', label: 'Svc CIDR' },
  ];
  for (const { key, label } of cidrTypes) {
    const thisCidr = cluster[key] as string | undefined;
    if (!thisCidr) continue;
    for (const other of allClusters) {
      if (other.id === cluster.id) continue;
      for (const { key: otherKey, label: otherLabel } of cidrTypes) {
        const otherCidr = other[otherKey] as string | undefined;
        if (otherCidr && cidrsOverlap(thisCidr, otherCidr)) {
          allCidrPairs.push({ thisLabel: label, thisCidr, otherCluster: other, otherLabel, otherCidr });
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{cluster.name}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md"><X className="w-5 h-5" /></button>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 mb-4">
          {topRows.map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <dt className="text-xs text-muted-foreground w-24 flex-shrink-0 pt-0.5">{label}</dt>
              <dd className="text-sm font-medium break-all">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>

        {/* CIDR 블록 */}
        {(cluster.cidr || cluster.podCidr || cluster.svcCidr) && (
          <div className="mt-2 mb-4 grid grid-cols-1 gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">네트워크 대역</p>
            <CidrBlock label="Node CIDR" cidr={cluster.cidr} first={cluster.firstHost} last={cluster.lastHost}
              color="border-blue-500/30 bg-blue-500/5 text-blue-400" />
            <CidrBlock label="Pod CIDR" cidr={cluster.podCidr} first={cluster.podFirstHost} last={cluster.podLastHost}
              color="border-emerald-500/30 bg-emerald-500/5 text-emerald-400" />
            <CidrBlock label="Service CIDR" cidr={cluster.svcCidr} first={cluster.svcFirstHost} last={cluster.svcLastHost}
              color="border-violet-500/30 bg-violet-500/5 text-violet-400" />
          </div>
        )}

        {/* NIC 정보 */}
        {(cluster.bond0Ip || cluster.bond0Mac || cluster.bond1Ip || cluster.bond1Mac) && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">NIC 정보</p>
            <div className="grid grid-cols-2 gap-2">
              {(cluster.bond0Ip || cluster.bond0Mac) && (
                <div className="border border-border rounded-lg px-3 py-2 bg-muted/10">
                  <p className="text-xs font-semibold text-primary mb-1">bond0</p>
                  {cluster.bond0Ip && <p className="text-xs font-mono text-muted-foreground">IP: <span className="text-foreground">{cluster.bond0Ip}</span></p>}
                  {cluster.bond0Mac && <p className="text-xs font-mono text-muted-foreground">MAC: <span className="text-foreground">{cluster.bond0Mac}</span></p>}
                </div>
              )}
              {(cluster.bond1Ip || cluster.bond1Mac) && (
                <div className="border border-border rounded-lg px-3 py-2 bg-muted/10">
                  <p className="text-xs font-semibold text-primary mb-1">bond1</p>
                  {cluster.bond1Ip && <p className="text-xs font-mono text-muted-foreground">IP: <span className="text-foreground">{cluster.bond1Ip}</span></p>}
                  {cluster.bond1Mac && <p className="text-xs font-mono text-muted-foreground">MAC: <span className="text-foreground">{cluster.bond1Mac}</span></p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* CIDR 겹침 경고 */}
        {allCidrPairs.length > 0 && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              CIDR 겹침 감지 — {allCidrPairs.length}건 주소 범위 충돌
            </p>
            <div className="space-y-1">
              {allCidrPairs.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-muted-foreground">{p.thisLabel}</span>
                  <span className="font-mono text-foreground">{p.thisCidr}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="font-medium text-foreground">{p.otherCluster.name}</span>
                  <span className="text-muted-foreground">{p.otherLabel}</span>
                  <span className="font-mono text-foreground">{p.otherCidr}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(cluster.ciliumConfig || cluster.description) && (
          <div className="space-y-3">
            {cluster.ciliumConfig && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Cilium 설정</p>
                <pre className="text-xs bg-muted/30 border border-border rounded-lg p-3 whitespace-pre-wrap font-mono">
                  {cluster.ciliumConfig}
                </pre>
              </div>
            )}
            {cluster.description && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">정보 / 설명</p>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{cluster.description}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onEdit}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2">
            <Pencil className="w-4 h-4" /> 수정
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableClusterRow({
  id, isDragDisabled, children,
}: { id: string; isDragDisabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: isDragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-3 w-7">
        {!isDragDisabled && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 rounded">
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </td>
      {children}
    </tr>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function ClusterManagePage() {
  const { clusters } = useClusterStore();
  useClusters();
  const queryClient = useQueryClient();

  const [editCluster, setEditCluster] = useState<Cluster | null>(null);
  const [detailCluster, setDetailCluster] = useState<Cluster | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { orderedItems: dndClusters, handleDragEnd: dndHandleDragEnd } = useLocalOrder(clusters, 'k8s:order:clusters');
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSort = (col: SortKey) => {
    if (sortKey === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col); setSortDir('asc'); }
  };

  const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
  const baseClusters = sortKey ? clusters : dndClusters;
  const sortedClusters = [...baseClusters].sort((a, b) => {
    if (!sortKey) return 0;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'status') cmp = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
    else if (sortKey === 'operationLevel') cmp = (a.operationLevel ?? '').localeCompare(b.operationLevel ?? '');
    else if (sortKey === 'region') cmp = (a.region ?? '').localeCompare(b.region ?? '');
    else if (sortKey === 'nodeCount') cmp = (a.nodeCount ?? 0) - (b.nodeCount ?? 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleDelete = async (cluster: Cluster) => {
    if (!confirm(`"${cluster.name}" 클러스터를 삭제하시겠습니까?\n연관된 Addon, Playbook, 점검 이력이 모두 삭제됩니다.`)) return;
    setDeletingId(cluster.id);
    try {
      await clustersApi.delete(cluster.id);
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['clusters'] });
  };

  // CIDR 겹침 그룹 계산: Node/Pod/Svc CIDR 모두 비교, 같은 그룹 번호 = 같은 색상
  const cidrOverlapGroups = useMemo(() => {
    if (clusters.length < 2) return new Map<string, number>();

    const adj = new Map<string, string[]>();
    for (const c of clusters) adj.set(c.id, []);

    const cidrKeys: (keyof Cluster)[] = ['cidr', 'podCidr', 'svcCidr'];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ci = clusters[i];
        const cj = clusters[j];
        let overlap = false;
        outer: for (const ki of cidrKeys) {
          for (const kj of cidrKeys) {
            const vi = ci[ki] as string | undefined;
            const vj = cj[kj] as string | undefined;
            if (vi && vj && cidrsOverlap(vi, vj)) { overlap = true; break outer; }
          }
        }
        if (overlap) {
          adj.get(ci.id)!.push(cj.id);
          adj.get(cj.id)!.push(ci.id);
        }
      }
    }

    const groupMap = new Map<string, number>();
    const visited = new Set<string>();
    let groupIdx = 0;
    for (const c of clusters) {
      if (visited.has(c.id) || (adj.get(c.id)?.length ?? 0) === 0) continue;
      const queue = [c.id];
      visited.add(c.id);
      while (queue.length > 0) {
        const id = queue.shift()!;
        groupMap.set(id, groupIdx);
        for (const neighbor of adj.get(id) ?? []) {
          if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
        }
      }
      groupIdx++;
    }
    return groupMap;
  }, [clusters]);

  const STATUS_DOT: Record<string, string> = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
  };
  const STATUS_LABEL: Record<string, string> = {
    healthy: 'Healthy',
    warning: 'Warning',
    critical: 'Critical',
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">클러스터 관리</h1>
            {clusters.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                전체 {clusters.length}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {clusters.length === 0 ? (
          <div className="text-center py-20">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">등록된 클러스터가 없습니다.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Settings 페이지에서 클러스터를 먼저 등록하세요.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="w-7" />
                    <SortTh label="클러스터명" col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="상태" col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="운영레벨" col="operationLevel" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="지역" col="region" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="노드 수" col="nodeCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Max Pod</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Node CIDR</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Pod CIDR</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">Svc CIDR</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">bond0 IP</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">bond1 IP</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">호스트명</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">정보</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => { if (e.over) dndHandleDragEnd(String(e.active.id), String(e.over.id)); }}>
                  <SortableContext items={sortedClusters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                  {sortedClusters.map((cluster) => (
                    <SortableClusterRow key={cluster.id} id={cluster.id} isDragDisabled={!!sortKey}>
                      <td className="px-4 py-3 font-medium whitespace-nowrap cursor-pointer" onClick={() => setDetailCluster(cluster)}>{cluster.name}</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[cluster.status] ?? 'bg-slate-400'}`} />
                          <span className="text-xs">{STATUS_LABEL[cluster.status] ?? cluster.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {cluster.operationLevel ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${LEVEL_BADGE[cluster.operationLevel] ?? 'bg-muted text-muted-foreground border-border'}`}>
                            {OPERATION_LEVELS.find((l) => l.value === cluster.operationLevel)?.label ?? cluster.operationLevel}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">-</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground cursor-pointer" onClick={() => setDetailCluster(cluster)}>{cluster.region || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs cursor-pointer" onClick={() => setDetailCluster(cluster)}>{cluster.nodeCount ?? '-'}</td>
                      <td className="px-4 py-3 text-center font-mono text-xs cursor-pointer" onClick={() => setDetailCluster(cluster)}>{cluster.maxPod ?? '-'}</td>
                      {/* Node CIDR */}
                      <td className="px-4 py-3 font-mono text-xs cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {(() => {
                          const groupIdx = cidrOverlapGroups.get(cluster.id);
                          const oc = groupIdx !== undefined ? OVERLAP_COLORS[groupIdx % OVERLAP_COLORS.length] : null;
                          return cluster.cidr ? (
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${oc ? `${oc.bg} ${oc.border} border` : ''}`}>
                              <span className={oc ? oc.text : 'text-muted-foreground'}>{cluster.cidr}</span>
                              {oc && (
                                <span className={`inline-flex items-center gap-0.5 text-[10px] ${oc.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${oc.dot}`} />겹침
                                </span>
                              )}
                            </span>
                          ) : <span className="text-muted-foreground">-</span>;
                        })()}
                      </td>
                      {/* Pod CIDR */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {cluster.podCidr || '-'}
                      </td>
                      {/* Svc CIDR */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {cluster.svcCidr || '-'}
                      </td>
                      {/* bond0 IP */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {cluster.bond0Ip || '-'}
                      </td>
                      {/* bond1 IP */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        {cluster.bond1Ip || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[180px] truncate cursor-pointer" onClick={() => setDetailCluster(cluster)}>{cluster.hostname || '-'}</td>
                      <td className="px-4 py-3 max-w-[160px] cursor-pointer" onClick={() => setDetailCluster(cluster)}>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{cluster.description || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailCluster(null); setEditCluster(cluster); }}
                            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(cluster); }}
                            disabled={deletingId === cluster.id}
                            className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </SortableClusterRow>
                  ))}
                  </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          </div>
        )}

        {/* 등록 안내 */}
        <p className="text-xs text-muted-foreground mt-4 text-center">
          클러스터 등록 및 API/kubeconfig 설정은 <strong>Settings</strong> 페이지에서 할 수 있습니다.
        </p>
      </main>

      {/* Edit Modal */}
      {editCluster && (
        <ClusterMetaModal
          isOpen={true}
          onClose={() => setEditCluster(null)}
          cluster={editCluster}
          onSaved={handleSaved}
        />
      )}

      {/* Detail Modal */}
      {detailCluster && !editCluster && (
        <ClusterDetailModal
          cluster={detailCluster}
          onClose={() => setDetailCluster(null)}
          onEdit={() => { setEditCluster(detailCluster); setDetailCluster(null); }}
          allClusters={clusters}
        />
      )}
    </div>
  );
}
