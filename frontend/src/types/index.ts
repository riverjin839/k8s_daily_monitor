// Status types
export type Status = 'healthy' | 'warning' | 'critical';

// Cluster
export interface Cluster {
  id: string;
  name: string;
  apiEndpoint: string;
  kubeconfigPath: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

// Addon
export interface Addon {
  id: string;
  clusterId: string;
  name: string;
  type: string;
  icon: string;
  description: string;
  status: Status;
  responseTime?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  lastCheck: string;
}

// Check Log
export interface CheckLog {
  id: string;
  clusterId: string;
  clusterName: string;
  addonId?: string;
  addonName?: string;
  status: Status;
  message: string;
  checkedAt: string;
}

// Summary Stats
export interface SummaryStats {
  totalClusters: number;
  healthy: number;
  warning: number;
  critical: number;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Addon Config (for easy add/remove)
export interface AddonConfig {
  name: string;
  type: string;
  icon: string;
  description: string;
  checkPlaybook: string;
}

// Playbook
export interface Playbook {
  id: string;
  clusterId: string;
  name: string;
  description?: string;
  playbookPath: string;
  inventoryPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraVars?: Record<string, any>;
  tags?: string;
  status: string;  // healthy | warning | critical | unknown | running
  lastRunAt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastResult?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunResult {
  id: string;
  status: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats?: Record<string, any>;
  durationMs: number;
}
