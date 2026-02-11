import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Bot, Loader2, WifiOff, Download } from 'lucide-react';
import { agentApi } from '@/services/api';
import { useClusterStore } from '@/stores/clusterStore';
import type { AgentChatResponse, AgentPullProgress } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export function AgentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null); // null = unknown
  const [modelMissing, setModelMissing] = useState(false);
  const [pullProgress, setPullProgress] = useState<AgentPullProgress | null>(null);
  const [isPulling, setIsPulling] = useState(false);
  const pullAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { clusters, addons } = useClusterStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Check Ollama health when chat opens
  const checkHealth = useCallback(async () => {
    try {
      const { data } = await agentApi.health();
      setIsOnline(data.status === 'online');
      // Check if model is missing from detail message
      const detail = (data as { detail?: string }).detail || '';
      setModelMissing(detail.includes('not pulled'));
    } catch {
      setIsOnline(false);
      setModelMissing(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkHealth();
    }
  }, [isOpen, checkHealth]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handlePullModel = async () => {
    if (isPulling) return;
    setIsPulling(true);
    setPullProgress({ status: 'starting', percent: 0, completedBytes: 0, totalBytes: 0 });

    const abort = new AbortController();
    pullAbortRef.current = abort;

    try {
      await agentApi.pullModelStream(
        (progress) => setPullProgress(progress),
        abort.signal,
      );
      // Pull finished — re-check health
      setPullProgress(null);
      setIsPulling(false);
      setModelMissing(false);
      checkHealth();
    } catch {
      if (!abort.signal.aborted) {
        setPullProgress({ status: 'error', percent: 0, completedBytes: 0, totalBytes: 0, error: 'Download failed.' });
      }
      setIsPulling(false);
    }
  };

  const buildContext = (): Record<string, unknown> | undefined => {
    if (clusters.length === 0) return undefined;
    const clusterSummaries = clusters.map((c) => `${c.name}: ${c.status}`).join(', ');
    const addonSummaries = Object.entries(addons)
      .flatMap(([, list]) => list.map((a) => `${a.name}(${a.status})`))
      .slice(0, 20)
      .join(', ');

    return {
      cluster_name: clusterSummaries,
      cluster_status: `${clusters.length} cluster(s)`,
      extra: addonSummaries ? `Addons: ${addonSummaries}` : undefined,
    };
  };

  const addMessage = (role: ChatMessage['role'], content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
  };

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    setInput('');
    addMessage('user', query);
    setIsLoading(true);

    try {
      const { data } = await agentApi.chat({ query, context: buildContext() });
      const resp = data as unknown as AgentChatResponse;

      if (resp.status === 'offline') {
        setIsOnline(false);
        addMessage('system', resp.answer);
      } else {
        setIsOnline(true);
        addMessage('assistant', resp.answer);
      }
    } catch {
      // Network error / backend unreachable — dashboard keeps working
      setIsOnline(false);
      addMessage(
        'system',
        'AI Server is not responding. Please check the Ollama connection.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center hover:scale-105 active:scale-95"
        aria-label="Toggle AI Agent"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[520px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">AI Agent</span>
              {isPulling && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Downloading
                </span>
              )}
              {!isPulling && isOnline === true && !modelMissing && (
                <span className="w-2 h-2 rounded-full bg-green-500" title="Online" />
              )}
              {!isPulling && isOnline === true && modelMissing && (
                <span className="flex items-center gap-1 text-xs text-orange-400">
                  <Download className="w-3 h-3" /> No model
                </span>
              )}
              {!isPulling && isOnline === false && (
                <span className="flex items-center gap-1 text-xs text-orange-400">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Model Download Banner */}
          {modelMissing && !isPulling && (
            <div className="px-4 py-3 bg-orange-500/10 border-b border-orange-500/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-orange-300">AI Model not installed</span>
                <button
                  onClick={handlePullModel}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Pull Progress Bar */}
          {isPulling && pullProgress && (
            <div className="px-4 py-3 bg-blue-500/10 border-b border-blue-500/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-blue-300 truncate max-w-[60%]">
                  {pullProgress.status === 'error'
                    ? pullProgress.error
                    : pullProgress.status.startsWith('pulling')
                      ? 'Downloading model...'
                      : pullProgress.status}
                </span>
                <span className="text-xs font-mono text-blue-400">
                  {pullProgress.percent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-2 bg-blue-900/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(pullProgress.percent, 100)}%` }}
                />
              </div>
              {pullProgress.totalBytes > 0 && (
                <div className="text-[10px] text-blue-400/70 mt-1 text-right">
                  {formatBytes(pullProgress.completedBytes)} / {formatBytes(pullProgress.totalBytes)}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !modelMissing && !isPulling && (
              <div className="text-center text-muted-foreground text-sm py-12">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Ask me about your Kubernetes clusters.</p>
                <p className="text-xs mt-1 opacity-70">
                  e.g. &quot;Why is my pod CrashLooping?&quot;
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : msg.role === 'system'
                        ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20 rounded-bl-sm'
                        : 'bg-secondary text-foreground rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary text-muted-foreground px-3 py-2 rounded-xl rounded-bl-sm text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isOnline === false ? 'AI Agent offline...' : 'Ask about your clusters...'}
                disabled={isLoading}
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 placeholder:text-muted-foreground"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
