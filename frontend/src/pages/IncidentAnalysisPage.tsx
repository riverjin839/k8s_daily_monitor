import { useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Loader2, Search, Zap } from 'lucide-react';
import { useAnalyzeIncident, useAnalyzerHealth } from '@/hooks/useIncidentAnalysis';
import type { IncidentAnalysisRequest, IncidentAnalysisResult, KubeEvent } from '@/types';

const SEVERITY_STYLE: Record<string, { icon: typeof AlertTriangle; bg: string; border: string; text: string; badge: string }> = {
  critical: { icon: AlertTriangle, bg: 'bg-red-500/10',    border: 'border-red-500/40',    text: 'text-red-400',    badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
  warning:  { icon: AlertTriangle, bg: 'bg-amber-500/10',  border: 'border-amber-500/40',  text: 'text-amber-400',  badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  info:     { icon: Info,          bg: 'bg-blue-500/10',   border: 'border-blue-500/40',   text: 'text-blue-400',   badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
};

const BACKEND_LABEL: Record<string, string> = {
  claude:     'Claude AI',
  local_llm:  'Local LLM',
  rule_based: 'Rule-Based',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-secondary rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function ResultPanel({ result }: { result: IncidentAnalysisResult }) {
  const st = SEVERITY_STYLE[result.severity] ?? SEVERITY_STYLE.info;
  const SeverityIcon = st.icon;

  return (
    <div className={`rounded-xl border ${st.border} ${st.bg} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <SeverityIcon className={`w-5 h-5 flex-shrink-0 ${st.text}`} />
          <span className={`text-sm font-bold ${st.text} uppercase tracking-wide`}>{result.severity}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${st.badge}`}>
            {BACKEND_LABEL[result.analyzedBy] ?? result.analyzedBy}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(result.analyzedAt).toLocaleTimeString('ko-KR')}
          </span>
        </div>
      </div>

      {/* Root cause */}
      <div className="rounded-lg bg-background/60 border border-border px-4 py-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">근본 원인</p>
        <p className="text-sm text-foreground">{result.rootCause}</p>
      </div>

      {/* Confidence */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">신뢰도</p>
        <ConfidenceBar value={result.confidence} />
      </div>

      {/* Actions */}
      {result.suggestedActions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">조치 방안</p>
          <ol className="space-y-1.5">
            {result.suggestedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${st.badge} border`}>
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Runbooks */}
      {result.relatedRunbooks && result.relatedRunbooks.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">관련 런북</p>
          <div className="flex flex-wrap gap-1.5">
            {result.relatedRunbooks.map((rb) => (
              <span key={rb} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                {rb}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event, index }: { event: KubeEvent; index: number }) {
  return (
    <div className={`grid grid-cols-[80px_70px_60px_1fr] gap-2 py-1.5 px-3 text-xs ${index % 2 === 0 ? 'bg-secondary/20' : ''}`}>
      <span className={`font-medium truncate ${event.type === 'Warning' ? 'text-amber-400' : 'text-muted-foreground'}`}>{event.type ?? 'Normal'}</span>
      <span className="font-mono text-muted-foreground truncate">{event.reason}</span>
      <span className="text-muted-foreground text-center">x{event.count}</span>
      <span className="text-foreground truncate">{event.message}</span>
    </div>
  );
}

export function IncidentAnalysisPage() {
  const { data: health } = useAnalyzerHealth();
  const { mutate: analyze, isPending, data: response } = useAnalyzeIncident();

  const [podName, setPodName]     = useState('');
  const [namespace, setNamespace] = useState('default');
  const [currentLogs, setLogs]    = useState('');
  const [describeOut, setDescribe] = useState('');
  const [rawEvents, setRawEvents]  = useState('');

  const ic = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const lc = 'block text-xs font-medium text-muted-foreground mb-1';

  const parseEvents = (): KubeEvent[] => {
    if (!rawEvents.trim()) return [];
    return rawEvents
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s{2,}|\t/);
        return {
          type:      parts[0]?.trim() ?? 'Normal',
          reason:    parts[1]?.trim() ?? 'Unknown',
          count:     parseInt(parts[2] ?? '1', 10) || 1,
          message:   parts.slice(3).join(' ').trim() || line,
          firstTime: '',
          lastTime:  '',
        };
      });
  };

  const handleSubmit = () => {
    if (!podName.trim()) return;
    const payload: IncidentAnalysisRequest = {
      podName:       podName.trim(),
      namespace:     namespace.trim() || 'default',
      timestamp:     new Date().toISOString(),
      events:        parseEvents(),
      currentLogs:   currentLogs,
      describeOutput: describeOut,
    };
    analyze(payload);
  };

  const events = parseEvents();

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1400px] mx-auto px-6 py-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">장애 로그 자동 요약</h1>
          </div>
          {health && (
            <div className="flex items-center gap-2 text-xs">
              {health.available
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <AlertTriangle className="w-4 h-4 text-amber-400" />}
              <span className="text-muted-foreground">
                {BACKEND_LABEL[health.backend] ?? health.backend}
                {health.available ? ' 연결됨' : ' 오프라인'}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 입력 패널 */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pod 정보</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Pod 이름 *</label>
                  <input type="text" value={podName} onChange={(e) => setPodName(e.target.value)}
                    placeholder="my-app-7d9f8b-xxxx" className={ic} />
                </div>
                <div>
                  <label className={lc}>Namespace</label>
                  <input type="text" value={namespace} onChange={(e) => setNamespace(e.target.value)}
                    placeholder="default" className={ic} />
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">이벤트 (선택)</p>
              <div>
                <label className={lc}>kubectl get events 출력 붙여넣기</label>
                <textarea value={rawEvents} onChange={(e) => setRawEvents(e.target.value)}
                  placeholder={"Warning  BackOff  3  Back-off restarting failed container\nWarning  OOMKilling  1  Memory limit reached"}
                  rows={4} className={`${ic} font-mono text-xs resize-none`} />
              </div>
              {events.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[80px_70px_60px_1fr] gap-2 px-3 py-1.5 bg-secondary/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>Type</span><span>Reason</span><span className="text-center">Count</span><span>Message</span>
                  </div>
                  {events.map((ev, i) => <EventRow key={i} event={ev} index={i} />)}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">로그 / Describe</p>
              <div>
                <label className={lc}>kubectl logs (현재 컨테이너)</label>
                <textarea value={currentLogs} onChange={(e) => setLogs(e.target.value)}
                  placeholder="Pod 로그를 붙여넣으세요..."
                  rows={6} className={`${ic} font-mono text-xs resize-none`} />
              </div>
              <div>
                <label className={lc}>kubectl describe pod 출력</label>
                <textarea value={describeOut} onChange={(e) => setDescribe(e.target.value)}
                  placeholder="kubectl describe pod 출력을 붙여넣으세요..."
                  rows={6} className={`${ic} font-mono text-xs resize-none`} />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isPending || !podName.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />분석 중...</>
                : <><Search className="w-4 h-4" />장애 분석 시작</>}
            </button>
          </div>

          {/* 결과 패널 */}
          <div>
            {response?.result ? (
              <ResultPanel result={response.result} />
            ) : response?.error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-400">
                분석 실패: {response.error}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground/50 rounded-xl border border-dashed border-border">
                <Zap className="w-12 h-12 mb-3" />
                <p className="text-sm">Pod 정보와 로그를 입력하고</p>
                <p className="text-sm">분석을 시작하세요</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
