import { useState, type FormEvent } from 'react';
import { X, Cpu, Network, Server } from 'lucide-react';
import type { Cluster, ClusterManageUpdate } from '@/types';
import { clustersApi } from '@/services/api';
import { OPERATION_LEVELS } from './constants';

interface ClusterMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: Cluster;
  onSaved: () => void;
}

const MODAL_TABS = [
  { id: 'node',    label: '노드 스펙 / NIC', icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: 'network', label: 'N/W CIDR',        icon: <Network className="w-3.5 h-3.5" /> },
  { id: 'extra',   label: '기타',             icon: <Server className="w-3.5 h-3.5" /> },
] as const;

type ModalTab = 'node' | 'network' | 'extra';

export function ClusterMetaModal({ isOpen, onClose, cluster, onSaved }: ClusterMetaModalProps) {
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
  const [bgpEnabled, setBgpEnabled]     = useState(cluster.bgpEnabled ?? false);
  const [asNumber, setAsNumber]         = useState(cluster.asNumber ?? '');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [modalTab, setModalTab]         = useState<ModalTab>('node');

  if (!isOpen) return null;

  const ic = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const lc = 'block text-xs font-medium text-muted-foreground mb-1';

  const handleSubmit = async (e: FormEvent) => {
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
        bgpEnabled,
        asNumber: asNumber.trim() || undefined,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold">클러스터 정보 수정</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{cluster.name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 공통 상단 필드 */}
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto border border-border rounded-b-lg rounded-tr-lg mx-6 p-5 space-y-5">
            {error && (
              <div className="px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {error}
              </div>
            )}

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

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">BGP 설정</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-background border border-border rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={bgpEnabled}
                          onChange={(e) => setBgpEnabled(e.target.checked)}
                          className="w-4 h-4 accent-primary rounded"
                        />
                        <span className="text-sm text-foreground">BGP 사용</span>
                      </label>
                    </div>
                    <div>
                      <label className={lc}>AS Number</label>
                      <input
                        type="text"
                        value={asNumber}
                        onChange={(e) => setAsNumber(e.target.value)}
                        disabled={!bgpEnabled}
                        placeholder="예: 64512"
                        className={`${ic} disabled:opacity-40`}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {modalTab === 'network' && (
              <div className="space-y-5">
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">Node CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lc}>Node CIDR</label>
                      <input type="text" value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="192.168.0.0/24" className={ic} /></div>
                    <div><label className={lc}>First Host</label>
                      <input type="text" value={firstHost} onChange={(e) => setFirstHost(e.target.value)} placeholder="192.168.0.1" className={ic} /></div>
                    <div><label className={lc}>Last Host</label>
                      <input type="text" value={lastHost} onChange={(e) => setLastHost(e.target.value)} placeholder="192.168.0.254" className={ic} /></div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">Pod CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lc}>Pod CIDR</label>
                      <input type="text" value={podCidr} onChange={(e) => setPodCidr(e.target.value)} placeholder="10.244.0.0/16" className={ic} /></div>
                    <div><label className={lc}>First Host</label>
                      <input type="text" value={podFirstHost} onChange={(e) => setPodFirstHost(e.target.value)} placeholder="10.244.0.1" className={ic} /></div>
                    <div><label className={lc}>Last Host</label>
                      <input type="text" value={podLastHost} onChange={(e) => setPodLastHost(e.target.value)} placeholder="10.244.255.254" className={ic} /></div>
                  </div>
                </div>

                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4">
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">Service CIDR 대역</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={lc}>Service CIDR</label>
                      <input type="text" value={svcCidr} onChange={(e) => setSvcCidr(e.target.value)} placeholder="10.96.0.0/12" className={ic} /></div>
                    <div><label className={lc}>First Host</label>
                      <input type="text" value={svcFirstHost} onChange={(e) => setSvcFirst(e.target.value)} placeholder="10.96.0.1" className={ic} /></div>
                    <div><label className={lc}>Last Host</label>
                      <input type="text" value={svcLastHost} onChange={(e) => setSvcLast(e.target.value)} placeholder="10.111.255.254" className={ic} /></div>
                  </div>
                </div>
              </div>
            )}

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
