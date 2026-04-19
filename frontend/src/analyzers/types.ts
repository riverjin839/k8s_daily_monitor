export interface KubeEvent {
  reason: string;
  message: string;
  count: number;
  firstTime: string;
  lastTime: string;
  type?: string;
}

export interface IncidentContext {
  podName: string;
  namespace: string;
  timestamp: string;
  events: KubeEvent[];
  currentLogs: string;
  previousLogs?: string;
  describeOutput: string;
  relatedWorkload?: {
    kind: string;
    name: string;
    status: string;
  };
  argocdStatus?: {
    app: string;
    syncStatus: string;
    lastSyncAt: string;
  };
}

export interface AnalysisResult {
  severity: 'critical' | 'warning' | 'info';
  rootCause: string;
  suggestedActions: string[];
  relatedRunbooks?: string[];
  confidence: number;
  analyzedBy: 'claude' | 'local_llm' | 'rule_based';
  analyzedAt: string;
}

export interface LogAnalyzer {
  analyze(context: IncidentContext): Promise<AnalysisResult>;
  healthCheck(): Promise<boolean>;
}
