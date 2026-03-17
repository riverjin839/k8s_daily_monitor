import { useState, useMemo } from 'react';
import {
  Server, Pencil, Trash2, X, AlertTriangle,
  Network, Cpu, Search, ChevronDown,
} from 'lucide-react';
import { Cluster, ClusterManageUpdate } from '@/types';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { clustersApi } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';

// ── 운영레벨 ──────────────────────────────────────────────────────────────────
const OPERATION_LEVELS = [
  { value: 'production', label: '운영 (Production)' },
  { value: 'staging',    label: '스테이징 (Staging)' },
  { value: 'dev',        label: '개발 (Dev)' },
  { value: 'test',       label: '테스트 (Test)' },
  { value: 'dr',         label: 'DR' },
];

const LEVEL_BADGE: Record<string, string> = {
  production: 'bg-red-500/15 text-red-400 border-red-500/30',
  staging:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  dev:        'bg-blue-500/15 text-blue-400 border-blue-500/30',
  test:       'bg-slate-500/15 text-slate-400 border-slate-500/30',
  dr:         'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

const STATUS_STYLE: Record<string, { dot: string; border: string; badge: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', border: 'border-l-emerald-500',  badge: 'bg-emerald-500/10 text-emerald-400', label: 'Healthy'  },
  warning: { dot: 'bg-amber-500',   border: 'border-l-amber-500',    badge: 'bg-amber-500/10 text-amber-400',     label: 'Warning'  },
  critical:{ dot: 'bg-red-500',     border: 'border-l-red-500',      badge: 'bg-red-500/10 text-red-400',         label: 'Critical' },
  pending: { dot: 'bg-slate-400',   border: 'border-l-slate-400',    badge: 'bg-slate-500/10 text-slate-400',     label: '임시등록' },
};

// ── CIDR 겹침 유틸 ────────────────────────────────────────────────────────────
function cidrIpToNum(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
}
function parseCidrRange(cidr: string): { start: number; end: number } | null {
  const m = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const prefix = parseInt(m[2], 10);
  if (prefix < 0 || prefix > 32) return null;
  const ipNum = cidrIpToNum(m[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const net  = (ipNum & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  return { start: net, end: bcast };
}
function cidrsOverlap(a: string, b: string): boolean {
  const ra = parseCidrRange(a), rb = parseCidrRange(b);
  return !!ra && !!rb && ra.start <= rb.end && rb.start <= ra.end;
}

const OVERLAP_COLORS = [
  { bg: 'bg-orange-500/10', text: 'text-orange-300', border: 'border-orange-500/40', dot: 'bg-orange-400' },
  { bg: 'bg-pink-500/10',   text: 'text-pink-300',   border: 'border-pink-500/40',   dot: 'bg-pink-400'   },
  { bg: 'bg-cyan-500/10',   text: 'text-cyan-300',   border: 'border-cyan-500/40',   dot: 'bg-cyan-400'   },
  { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/40', dot: 'bg-yellow-400' },
  { bg: 'bg-violet-500/10', text: 'text-violet-300', border: 'border-violet-500/40', dot: 'bg-violet-400' },
];

// ── 편집 모달 ─────────────────────────────────────────────────────────────────
interface ClusterMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  onSaved: () => void;
}

function ClusterMetaModal({ isOpen, onClose, cluster, onSaved }: ClusterMetaModalProps) {
  const [region, setRegion]             = useState(cluster.region ?? '');
  const [operationLevel, setLevel]      = useState(cluster.operationLevel ?? '');
  const [nodeCount, setNodeCount]       = useState(cluster.nodeCount?.toString() ?? '');
  const [maxPod, setMaxPod]             = useState(cluster.maxPod?.toString() ?? '');
  const [hostname, setHostname]         = useState(cluster.hostname ?? '');
  const [cidr, setCidr]                 = useState(cluster.cidr ?? '');
  const [firstHost, setFirstHost]       = useState(cluster.firstHost ?? '');
  const [lastHost, setLastHost]         = useState(cluster.lastHost ?? '');
  const [podCidr, setPodCidr]           = useState(cluster.podCidr ?? '');
  const [podFirstHost, setPodFirstHost] = useState(cluster.podFirstHost ?? '');
  const [podLastHost, setPodLastHost]   = useState(cluster.podLastHost ?? '');
  const [svcCidr, setSvcCidr]           = useState(cluster.svcCidr ?? '');
  const [svcFirstHost, setSvcFirst]     = useState(cluster.svcFirstHost ?? '');
  const [svcLastHost, setSvcLast]       = useState(cluster.svcLastHost ?? '');
  const [bond0Ip, setBond0Ip]           = useState(cluster.bond0Ip ?? '');
  const [bond0Mac, setBond0Mac]         = useState(cluster.bond0Mac ?? '');
  const [bond1Ip, setBond1Ip]           = useState(cluster.bond1Ip ?? '');
  const [bond1Mac, setBond1Mac]         = useState(cluster.bond1Mac ?? '');
  const [ciliumConfig, setCilium]       = useState(cluster.ciliumConfig ?? '');
  const [description, setDescription]  = useState(cluster.description ?? '');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [modalTab, setModalTab]         = useState<'node' | 'network' | 'extra'>('node');

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

  const ic = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const lc = 'block text-xs font-medium text-muted-foreground mb-1';

  const MODAL_TABS = [
    { id: 'node',    label: '노드 스펙 / NIC', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'network', label: 'N/W CIDR',       icon: <Network className="w-3.5 h-3.5" /> },
    { id: 'extra',   label: '기타',            icon: <Server className="w-3.5 h-3.5" /> },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">클러스터 정보 수정</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{cluster.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 위치 & 운영레벨 (공통 상단) */}
        <div className="px-6 pt-4 pb-3 grid grid-cols-3 gap-3 flex-shrink-0 border-b border-border/50">
          <div>
            <label className={lc}>지역</label>
            <input type="text" value={region} onChange={(e) => setRegion(e.target.value)}
              placeholder="예: 서울, ap-northeast-2" className={ic} />
          </div>
          <div>
            <label className={lc}>운영레벨</label>
            <select value={operationLevel} onChange={(e) => setLevel(e.target.value)} className={ic}>
              <option value="">— 선택 —</option>
              {OPERATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={lc}>호스트명</label>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)}
              placeholder="k8s-prod-master.example.com" className={ic} />
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 px-6 pt-3 flex-shrink-0">
          {MODAL_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setModalTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors ${
                modalTab === t.id
                  ? 'bg-card border-border text-foreground'
                  : 'bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto border border-border rounded-b-lg rounded-tr-lg mx-6 p-5 space-y-5">
            {error && (
              <div className="px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

            {/* 노드 스펙 / NIC */}
            {modalTab === 'node' && (
              <>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">노드 스펙</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={lc}>노드 수</label>
                      <input type="number" min="0" value={nodeCount} onChange={(e) => setNodeCount(e.target.value)}
                        placeholder="예: 5" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>Max Pod (노드당)</label>
                      <input type="number" min="0" value={maxPod} onChange={(e) => setMaxPod(e.target.value)}
                        placeholder="예: 110" className={ic} />
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">NIC 정보 (ifconfig)</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/10">
                      <p className="text-xs font-semibold text-primary">bond0</p>
                      <div>
                        <label className={lc}>IP 주소</label>
                        <input type="text" value={bond0Ip} onChange={(e) => setBond0Ip(e.target.value)}
                          placeholder="192.168.0.10/24" className={ic} />
                      </div>
                      <div>
                        <label className={lc}>MAC 주소</label>
                        <input type="text" value={bond0Mac} onChange={(e) => setBond0Mac(e.target.value)}
                          placeholder="aa:bb:cc:dd:ee:ff" className={ic} />
                      </div>
                    </div>
                    <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/10">
                      <p className="text-xs font-semibold text-primary">bond1</p>
                      <div>
                        <label className={lc}>IP 주소</label>
                        <input type="text" value={bond1Ip} onChange={(e) => setBond1Ip(e.target.value)}
                          placeholder="172.16.0.10/24" className={ic} />
                      </div>
                      <div>
                        <label className={lc}>MAC 주소</label>
                        <input type="text" value={bond1Mac} onChange={(e) => setBond1Mac(e.target.value)}
                          placeholder="aa:bb:cc:dd:ee:f0" className={ic} />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* N/W CIDR */}
            {modalTab === 'network' && (
              <div className="space-y-5">
                {/* Node CIDR */}
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">Node CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lc}>Node CIDR</label>
                      <input type="text" value={cidr} onChange={(e) => setCidr(e.target.value)}
                        placeholder="192.168.0.0/24" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>First Host</label>
                      <input type="text" value={firstHost} onChange={(e) => setFirstHost(e.target.value)}
                        placeholder="192.168.0.1" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>Last Host</label>
                      <input type="text" value={lastHost} onChange={(e) => setLastHost(e.target.value)}
                        placeholder="192.168.0.254" className={ic} />
                    </div>
                  </div>
                </div>

                {/* Pod CIDR */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Pod CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lc}>Pod CIDR</label>
                      <input type="text" value={podCidr} onChange={(e) => setPodCidr(e.target.value)}
                        placeholder="10.244.0.0/16" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>First Host</label>
                      <input type="text" value={podFirstHost} onChange={(e) => setPodFirstHost(e.target.value)}
                        placeholder="10.244.0.1" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>Last Host</label>
                      <input type="text" value={podLastHost} onChange={(e) => setPodLastHost(e.target.value)}
                        placeholder="10.244.255.254" className={ic} />
                    </div>
                  </div>
                </div>

                {/* Service CIDR */}
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">Service CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={lc}>Service CIDR</label>
                      <input type="text" value={svcCidr} onChange={(e) => setSvcCidr(e.target.value)}
                        placeholder="10.96.0.0/12" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>First Host</label>
                      <input type="text" value={svcFirstHost} onChange={(e) => setSvcFirst(e.target.value)}
                        placeholder="10.96.0.1" className={ic} />
                    </div>
                    <div>
                      <label className={lc}>Last Host</label>
                      <input type="text" value={svcLastHost} onChange={(e) => setSvcLast(e.target.value)}
                        placeholder="10.111.255.254" className={ic} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 기타 */}
            {modalTab === 'extra' && (
              <div className="space-y-4">
                <div>
                  <label className={lc}>주요 Cilium 설정</label>
                  <textarea value={ciliumConfig} onChange={(e) => setCilium(e.target.value)}
                    placeholder={`tunnel: vxlan\nkubeProxyReplacement: strict\nipv4NativeRoutingCIDR: 10.0.0.0/8`}
                    rows={5} className={`${ic} resize-none font-mono text-xs`} />
                </div>
                <div>
                  <label className={lc}>정보 / 설명</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="클러스터에 대한 추가 정보나 메모"
                    rows={4} className={`${ic} resize-none`} />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
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

// ── CIDR 행 컴포넌트 ──────────────────────────────────────────────────────────
function CidrRow({
  label, cidr, first, last, color, overlapColor,
}: {
  label: string;
  cidr?: string;
  first?: string;
  last?: string;
  color: { bg: string; border: string; text: string; label: string };
  overlapColor?: typeof OVERLAP_COLORS[0] | null;
}) {
  if (!cidr && !first && !last) {
    return (
      <div className={`rounded-lg border border-dashed border-border/40 px-3 py-2.5`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${color.label}`}>{label}</p>
        <p className="text-xs text-muted-foreground/50">미입력</p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${overlapColor ? `${overlapColor.bg} ${overlapColor.border}` : `${color.bg} ${color.border}`}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${overlapColor ? overlapColor.text : color.label}`}>{label}</p>
        {overlapColor && (
          <span className={`flex items-center gap-1 text-[10px] font-medium ${overlapColor.text}`}>
            <AlertTriangle className="w-3 h-3" />겹침
          </span>
        )}
      </div>
      {cidr  && <p className="text-xs font-mono"><span className="text-muted-foreground text-[10px]">CIDR  </span><span className="text-foreground font-semibold">{cidr}</span></p>}
      {first && <p className="text-xs font-mono mt-0.5"><span className="text-muted-foreground text-[10px]">First </span><span className="text-foreground">{first}</span></p>}
      {last  && <p className="text-xs font-mono mt-0.5"><span className="text-muted-foreground text-[10px]">Last  </span><span className="text-foreground">{last}</span></p>}
    </div>
  );
}

// ── 포스트잇 카드 ─────────────────────────────────────────────────────────────
type CardTab = 'node' | 'network';

function ClusterCard({
  cluster,
  onEdit,
  onDelete,
  deletingId,
  overlapGroupIdx,
}: {
  cluster: Cluster;
  onEdit: (c: Cluster) => void;
  onDelete: (c: Cluster) => void;
  deletingId: string | null;
  overlapGroupIdx: number | undefined;
}) {
  const [tab, setTab] = useState<CardTab>('node');
  const st = STATUS_STYLE[cluster.status] ?? STATUS_STYLE.pending;
  const overlapColor = overlapGroupIdx !== undefined
    ? OVERLAP_COLORS[overlapGroupIdx % OVERLAP_COLORS.length]
    : null;

  const hasNodeData   = !!(cluster.nodeCount || cluster.maxPod || cluster.hostname || cluster.bond0Ip || cluster.bond1Ip);
  const hasNetworkData = !!(cluster.cidr || cluster.podCidr || cluster.svcCidr);

  return (
    <div className={`bg-card border border-border border-l-4 ${st.border} rounded-xl flex flex-col shadow-sm hover:shadow-md transition-shadow`}>
      {/* 카드 헤더 */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
              <h3 className="text-sm font-bold truncate">{cluster.name}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
              {cluster.operationLevel && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${LEVEL_BADGE[cluster.operationLevel] ?? 'bg-muted text-muted-foreground border-border'}`}>
                  {OPERATION_LEVELS.find((l) => l.value === cluster.operationLevel)?.label ?? cluster.operationLevel}
                </span>
              )}
              {cluster.region && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                  {cluster.region}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(cluster)}
              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
              title="수정"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(cluster)}
              disabled={deletingId === cluster.id}
              className="p-1.5 hover:bg-red-500/10 rounded-md transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-40"
              title="삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* API Endpoint */}
        <p className="text-[10px] font-mono text-muted-foreground/60 mt-1.5 truncate" title={cluster.apiEndpoint}>
          {cluster.apiEndpoint}
        </p>
      </div>

      {/* 탭 스위처 */}
      <div className="flex border-b border-border/50">
        <button
          onClick={() => setTab('node')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === 'node'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Cpu className="w-3 h-3" />
          노드 스펙
          {hasNodeData && tab !== 'node' && <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />}
        </button>
        <button
          onClick={() => setTab('network')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            tab === 'network'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Network className="w-3 h-3" />
          N/W CIDR
          {overlapColor && <AlertTriangle className="w-3 h-3 text-amber-400" />}
          {hasNetworkData && tab !== 'network' && !overlapColor && <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />}
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="px-4 py-3 flex-1">

        {/* ── 노드 스펙 탭 ── */}
        {tab === 'node' && (
          <div className="space-y-3">
            {/* 스펙 요약 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">노드 수</p>
                <p className="text-lg font-bold text-foreground">{cluster.nodeCount ?? <span className="text-muted-foreground text-sm">-</span>}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Max Pod</p>
                <p className="text-lg font-bold text-foreground">{cluster.maxPod ?? <span className="text-muted-foreground text-sm">-</span>}</p>
              </div>
            </div>

            {/* 호스트명 */}
            {cluster.hostname && (
              <div className="px-3 py-2 bg-secondary/30 rounded-lg">
                <p className="text-[10px] text-muted-foreground mb-0.5">호스트명</p>
                <p className="text-xs font-mono text-foreground truncate">{cluster.hostname}</p>
              </div>
            )}

            {/* NIC 정보 */}
            {(cluster.bond0Ip || cluster.bond0Mac || cluster.bond1Ip || cluster.bond1Mac) ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">NIC</p>
                <div className="grid grid-cols-2 gap-2">
                  {(cluster.bond0Ip || cluster.bond0Mac) && (
                    <div className="border border-border rounded-lg px-2.5 py-2 bg-muted/10">
                      <p className="text-[10px] font-bold text-primary mb-1.5">bond0</p>
                      {cluster.bond0Ip && (
                        <div className="mb-1">
                          <p className="text-[9px] text-muted-foreground uppercase">IP</p>
                          <p className="text-[11px] font-mono text-foreground">{cluster.bond0Ip}</p>
                        </div>
                      )}
                      {cluster.bond0Mac && (
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">MAC</p>
                          <p className="text-[11px] font-mono text-foreground">{cluster.bond0Mac}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {(cluster.bond1Ip || cluster.bond1Mac) && (
                    <div className="border border-border rounded-lg px-2.5 py-2 bg-muted/10">
                      <p className="text-[10px] font-bold text-primary mb-1.5">bond1</p>
                      {cluster.bond1Ip && (
                        <div className="mb-1">
                          <p className="text-[9px] text-muted-foreground uppercase">IP</p>
                          <p className="text-[11px] font-mono text-foreground">{cluster.bond1Ip}</p>
                        </div>
                      )}
                      {cluster.bond1Mac && (
                        <div>
                          <p className="text-[9px] text-muted-foreground uppercase">MAC</p>
                          <p className="text-[11px] font-mono text-foreground">{cluster.bond1Mac}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              !cluster.nodeCount && !cluster.maxPod && !cluster.hostname && (
                <p className="text-xs text-muted-foreground/50 text-center py-2">노드 스펙 정보 없음 — 수정 버튼으로 입력하세요</p>
              )
            )}
          </div>
        )}

        {/* ── N/W CIDR 탭 ── */}
        {tab === 'network' && (
          <div className="space-y-2">
            <CidrRow
              label="Node CIDR"
              cidr={cluster.cidr}
              first={cluster.firstHost}
              last={cluster.lastHost}
              color={{ bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', label: 'text-blue-400' }}
              overlapColor={cluster.cidr ? overlapColor : null}
            />
            <CidrRow
              label="Pod CIDR"
              cidr={cluster.podCidr}
              first={cluster.podFirstHost}
              last={cluster.podLastHost}
              color={{ bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', text: 'text-emerald-400', label: 'text-emerald-400' }}
              overlapColor={cluster.podCidr ? overlapColor : null}
            />
            <CidrRow
              label="Service CIDR"
              cidr={cluster.svcCidr}
              first={cluster.svcFirstHost}
              last={cluster.svcLastHost}
              color={{ bg: 'bg-violet-500/5', border: 'border-violet-500/20', text: 'text-violet-400', label: 'text-violet-400' }}
              overlapColor={cluster.svcCidr ? overlapColor : null}
            />

            {/* Cilium 설정 미리보기 */}
            {cluster.ciliumConfig && (
              <div className="mt-1 pt-2 border-t border-border/40">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cilium 설정</p>
                <pre className="text-[10px] font-mono text-muted-foreground bg-muted/20 rounded p-2 whitespace-pre-wrap max-h-20 overflow-y-auto">
                  {cluster.ciliumConfig}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 카드 푸터 */}
      {cluster.description && (
        <div className="px-4 pb-3 pt-1 border-t border-border/30 mt-auto">
          <p className="text-[10px] text-muted-foreground/70 line-clamp-2">{cluster.description}</p>
        </div>
      )}
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, healthy: 2, pending: 3 };

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function ClusterManagePage() {
  const { clusters } = useClusterStore();
  useClusters();
  const queryClient = useQueryClient();

  const [editCluster, setEditCluster]   = useState<Cluster | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [filterLevel, setFilterLevel]   = useState('');
  const [sortBy, setSortBy]             = useState<'name' | 'status' | 'level'>('name');
  const [showFilter, setShowFilter]     = useState(false);

  // 검색 + 필터 + 정렬
  const filteredClusters = useMemo(() => {
    let list = [...clusters];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.region ?? '').toLowerCase().includes(q) ||
          (c.hostname ?? '').toLowerCase().includes(q) ||
          (c.apiEndpoint ?? '').toLowerCase().includes(q),
      );
    }
    if (filterLevel) list = list.filter((c) => c.operationLevel === filterLevel);
    list.sort((a, b) => {
      if (sortBy === 'status') return (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
      if (sortBy === 'level')  return (a.operationLevel ?? '').localeCompare(b.operationLevel ?? '');
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [clusters, search, filterLevel, sortBy]);

  // CIDR 겹침 그룹 계산
  const cidrOverlapGroups = useMemo(() => {
    if (clusters.length < 2) return new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const c of clusters) adj.set(c.id, []);
    const keys: (keyof Cluster)[] = ['cidr', 'podCidr', 'svcCidr'];
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const ci = clusters[i], cj = clusters[j];
        let overlap = false;
        outer: for (const ki of keys) {
          for (const kj of keys) {
            const vi = ci[ki] as string | undefined;
            const vj = cj[kj] as string | undefined;
            if (vi && vj && cidrsOverlap(vi, vj)) { overlap = true; break outer; }
          }
        }
        if (overlap) { adj.get(ci.id)!.push(cj.id); adj.get(cj.id)!.push(ci.id); }
      }
    }
    const groupMap = new Map<string, number>();
    const visited  = new Set<string>();
    let gIdx = 0;
    for (const c of clusters) {
      if (visited.has(c.id) || (adj.get(c.id)?.length ?? 0) === 0) continue;
      const q = [c.id];
      visited.add(c.id);
      while (q.length) {
        const id = q.shift()!;
        groupMap.set(id, gIdx);
        for (const nb of adj.get(id) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        }
      }
      gIdx++;
    }
    return groupMap;
  }, [clusters]);

  const overlapCount = cidrOverlapGroups.size;

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

  const handleSaved = () => queryClient.invalidateQueries({ queryKey: ['clusters'] });

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-6 py-8">

        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">클러스터 관리</h1>
            {clusters.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                {filteredClusters.length} / {clusters.length}
              </span>
            )}
            {overlapCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" />
                CIDR 겹침 {overlapCount}건
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilter((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            검색 / 필터
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilter ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 검색 / 필터 패널 */}
        {showFilter && (
          <div className="mb-5 p-4 bg-card border border-border rounded-xl flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">검색</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="이름, 지역, 호스트명, API Endpoint"
                  className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <label className="block text-xs text-muted-foreground mb-1">운영레벨</label>
              <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">전체</option>
                {OPERATION_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs text-muted-foreground mb-1">정렬</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'status' | 'level')}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="name">이름순</option>
                <option value="status">상태순</option>
                <option value="level">운영레벨순</option>
              </select>
            </div>
            {(search || filterLevel) && (
              <button
                onClick={() => { setSearch(''); setFilterLevel(''); }}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground bg-secondary border border-border rounded-lg transition-colors"
              >
                초기화
              </button>
            )}
          </div>
        )}

        {/* 카드 그리드 */}
        {clusters.length === 0 ? (
          <div className="text-center py-20">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">등록된 클러스터가 없습니다.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Settings 페이지에서 클러스터를 먼저 등록하세요.</p>
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {filteredClusters.map((cluster) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onEdit={(c) => setEditCluster(c)}
                onDelete={handleDelete}
                deletingId={deletingId}
                overlapGroupIdx={cidrOverlapGroups.get(cluster.id)}
              />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6 text-center">
          클러스터 등록 및 API/kubeconfig 설정은 <strong>Settings</strong> 페이지에서 할 수 있습니다.
        </p>
      </main>

      {/* 편집 모달 */}
      {editCluster && (
        <ClusterMetaModal
          isOpen
          onClose={() => setEditCluster(null)}
          cluster={editCluster}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
