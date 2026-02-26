import { useState } from 'react';
import { Calculator, Copy, Check, Plus, Trash2 } from 'lucide-react';

// ── Pure CIDR logic ───────────────────────────────────────────────────────────

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function numToIp(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.');
}

function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

interface CidrInfo {
  network: string;
  broadcast: string;
  mask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalHosts: number;
  usableHosts: number;
  prefix: number;
  ipClass: string;
}

function parseCidr(cidr: string): CidrInfo | null {
  const match = cidr.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!match) return null;

  const [, ipStr, prefixStr] = match;
  const prefix = parseInt(prefixStr, 10);
  if (prefix < 0 || prefix > 32) return null;

  const octets = ipStr.split('.').map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;

  const ipNum = ipToNum(ipStr);
  const mask = maskFromPrefix(prefix);
  const networkNum = (ipNum & mask) >>> 0;
  const broadcastNum = (networkNum | (~mask >>> 0)) >>> 0;

  const totalHosts = Math.pow(2, 32 - prefix);
  const usableHosts = prefix >= 31 ? totalHosts : Math.max(totalHosts - 2, 0);
  const firstHost = prefix >= 31 ? networkNum : networkNum + 1;
  const lastHost = prefix >= 31 ? broadcastNum : broadcastNum - 1;

  // IP class
  const firstOctet = octets[0];
  let ipClass = 'A';
  if (firstOctet >= 128 && firstOctet <= 191) ipClass = 'B';
  else if (firstOctet >= 192 && firstOctet <= 223) ipClass = 'C';
  else if (firstOctet >= 224 && firstOctet <= 239) ipClass = 'D (Multicast)';
  else if (firstOctet >= 240) ipClass = 'E (Reserved)';

  return {
    network: numToIp(networkNum),
    broadcast: numToIp(broadcastNum),
    mask: numToIp(mask),
    wildcard: numToIp(~mask >>> 0),
    firstHost: numToIp(firstHost),
    lastHost: numToIp(lastHost),
    totalHosts,
    usableHosts,
    prefix,
    ipClass,
  };
}

// Divide a CIDR block into N equal subnets
function divideSubnets(cidr: string, count: number): string[] {
  if (count < 2 || count > 256) return [];
  const info = parseCidr(cidr);
  if (!info) return [];

  const bitsNeeded = Math.ceil(Math.log2(count));
  const newPrefix = info.prefix + bitsNeeded;
  if (newPrefix > 32) return [];

  const base = ipToNum(info.network);
  const step = Math.pow(2, 32 - newPrefix);
  const result: string[] = [];
  for (let i = 0; i < Math.pow(2, bitsNeeded); i++) {
    result.push(`${numToIp((base + i * step) >>> 0)}/${newPrefix}`);
  }
  return result;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: string;
}

function InfoRow({ label, value, mono = true, highlight }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground w-36 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-medium ${mono ? 'font-mono' : ''} ${highlight ?? ''}`}>
          {value}
        </span>
        {mono && <CopyButton value={value} />}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface SubnetEntry {
  id: string;
  cidr: string;
  label: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

export function CidrCalculatorPage() {
  // Main calculator
  const [input, setInput] = useState('192.168.1.0/24');
  const [info, setInfo] = useState<CidrInfo | null>(() => parseCidr('192.168.1.0/24'));
  const [inputError, setInputError] = useState('');

  // Subnet divider
  const [divideCount, setDivideCount] = useState(4);
  const [subnets, setSubnets] = useState<string[]>([]);
  const [divideError, setDivideError] = useState('');

  // Multi-CIDR comparator
  const [entries, setEntries] = useState<SubnetEntry[]>([
    { id: genId(), cidr: '10.0.0.0/8', label: 'Cluster A' },
    { id: genId(), cidr: '172.16.0.0/12', label: 'Cluster B' },
  ]);

  const handleCalculate = (value: string) => {
    setInput(value);
    const result = parseCidr(value);
    if (result) {
      setInfo(result);
      setInputError('');
      // Auto-reset subnets when CIDR changes
      setSubnets([]);
      setDivideError('');
    } else {
      setInfo(null);
      setInputError('Invalid CIDR notation. Example: 192.168.1.0/24');
    }
  };

  const handleDivide = () => {
    if (!info) return;
    const result = divideSubnets(input, divideCount);
    if (result.length === 0) {
      setDivideError(`Cannot divide /${info.prefix} into ${divideCount} subnets — prefix would exceed /32`);
      setSubnets([]);
    } else {
      setSubnets(result);
      setDivideError('');
    }
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, { id: genId(), cidr: '10.0.0.0/24', label: `Network ${prev.length + 1}` }]);
  };

  const updateEntry = (id: string, field: keyof SubnetEntry, value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const formatHosts = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const inputClass =
    'px-3 py-2 bg-secondary border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50';

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-8">
          <Calculator className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">CIDR Calculator</h1>
          <span className="text-sm text-muted-foreground">— Subnet 계산 · 분할 · 비교</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* LEFT: Main Calculator */}
          <div className="space-y-6">
            {/* Input */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold mb-4">CIDR 계산</h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => handleCalculate(e.target.value)}
                  placeholder="192.168.1.0/24"
                  className={`${inputClass} flex-1 text-base`}
                />
              </div>
              {inputError && (
                <p className="mt-2 text-xs text-red-400">{inputError}</p>
              )}
            </div>

            {/* Results */}
            {info && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-6 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                  <span className="font-semibold text-sm">{input}</span>
                  <span className="text-xs text-muted-foreground">Class {info.ipClass}</span>
                </div>
                <div className="px-6 py-1">
                  <InfoRow label="Network Address" value={`${info.network}/${info.prefix}`} />
                  <InfoRow label="Subnet Mask" value={info.mask} />
                  <InfoRow label="Wildcard Mask" value={info.wildcard} />
                  <InfoRow label="Broadcast" value={info.broadcast} />
                  <InfoRow label="First Host" value={info.firstHost} highlight="text-green-400" />
                  <InfoRow label="Last Host" value={info.lastHost} highlight="text-green-400" />
                  <InfoRow label="Total Hosts" value={formatHosts(info.totalHosts)} mono={false} />
                  <InfoRow label="Usable Hosts" value={formatHosts(info.usableHosts)} mono={false} highlight="text-primary" />
                </div>

                {/* Visual range bar */}
                <div className="px-6 pb-5 pt-3">
                  <div className="text-xs text-muted-foreground mb-1.5">Address space /{info.prefix}</div>
                  <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 bg-gradient-to-r from-primary to-blue-400 rounded-full"
                      style={{ width: `${Math.max(((32 - info.prefix) / 32) * 100, 2)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>/0 (all)</span>
                    <span>/{info.prefix}</span>
                    <span>/32 (host)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Subnet Divider */}
            {info && (
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-base font-semibold mb-4">서브넷 분할</h2>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">분할 개수</span>
                  <input
                    type="number"
                    min={2}
                    max={256}
                    value={divideCount}
                    onChange={(e) => setDivideCount(parseInt(e.target.value, 10) || 2)}
                    className={`${inputClass} w-24`}
                  />
                  <button
                    onClick={handleDivide}
                    className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                  >
                    분할
                  </button>
                </div>
                {divideError && <p className="text-xs text-red-400 mb-3">{divideError}</p>}
                {subnets.length > 0 && (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {subnets.map((s, i) => {
                      const si = parseCidr(s);
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg text-sm font-mono"
                        >
                          <span className="text-muted-foreground text-xs mr-2">#{i + 1}</span>
                          <span className="flex-1">{s}</span>
                          {si && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {si.firstHost} – {si.lastHost}
                            </span>
                          )}
                          <CopyButton value={s} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Multi-CIDR Comparator */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">멀티 CIDR 비교</h2>
              <button
                onClick={addEntry}
                className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                추가
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(e) => updateEntry(entry.id, 'label', e.target.value)}
                    placeholder="Label"
                    className="px-2 py-1.5 bg-secondary border border-border rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <input
                    type="text"
                    value={entry.cidr}
                    onChange={(e) => updateEntry(entry.id, 'cidr', e.target.value)}
                    placeholder="10.0.0.0/24"
                    className={`${inputClass} flex-1 text-xs`}
                  />
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Comparison table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium pr-3">Label</th>
                    <th className="text-left py-2 text-muted-foreground font-medium pr-3">Network</th>
                    <th className="text-left py-2 text-muted-foreground font-medium pr-3">Mask</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Usable Hosts</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const ei = parseCidr(entry.cidr);
                    return (
                      <tr key={entry.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/10">
                        <td className="py-2 pr-3 font-medium">{entry.label || '—'}</td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">
                          {ei ? `${ei.network}/${ei.prefix}` : <span className="text-red-400">invalid</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-muted-foreground">
                          {ei ? ei.mask : '—'}
                        </td>
                        <td className="py-2 text-right font-mono text-primary">
                          {ei ? formatHosts(ei.usableHosts) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick reference */}
            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Quick Reference
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  ['/8', '16.7M hosts'],
                  ['/16', '65,534 hosts'],
                  ['/24', '254 hosts'],
                  ['/25', '126 hosts'],
                  ['/26', '62 hosts'],
                  ['/27', '30 hosts'],
                  ['/28', '14 hosts'],
                  ['/29', '6 hosts'],
                  ['/30', '2 hosts'],
                  ['/32', 'Single IP'],
                ].map(([prefix, desc]) => (
                  <div key={prefix} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-primary">{prefix}</span>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
