import axios, { type InternalAxiosRequestConfig } from 'axios';
import { Cluster, Addon, CheckLog, SummaryStats, ApiResponse, PaginatedResponse, Playbook, PlaybookRunResult, AgentChatRequest, AgentChatResponse, AgentHealthResponse, MetricCard, MetricQueryResult, Issue, IssueListResponse, IssueCreate, IssueUpdate, Task, TaskListResponse, TaskCreate, TaskUpdate, TaskStatusResponse, KanbanStatus, UiSettings, ClusterLinksPayload, WorkGuide, WorkGuideCreate, WorkGuideUpdate, WorkGuideListResponse, OpsNote, OpsNoteCreate, OpsNoteUpdate, OpsNoteListResponse, MindMap, MindMapListItem, MindMapCreate, MindMapUpdate, MindMapNode, MindMapNodeCreate, MindMapNodeUpdate, ManagementServer, ManagementServerCreate, ManagementServerUpdate, ManagementServerListResponse, TopologyTraceRequest, TopologyTraceResponse, TrendDigest, TrendItem, TrendSource } from '@/types';
import { isDebugEnabled, useDebugStore } from '@/stores/debugStore';

// snake_case → camelCase 변환 (Backend는 snake_case, Frontend는 camelCase)
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

// camelCase → snake_case 변환 (Frontend → Backend 요청 시)
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(convertKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        toCamelCase(key),
        convertKeys(value),
      ])
    );
  }
  return obj;
}

function convertKeysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(convertKeysToSnake);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        toSnakeCase(key),
        convertKeysToSnake(value),
      ])
    );
  }
  return obj;
}

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - camelCase → snake_case 자동 변환 + debug 로깅
type DebugConfig = InternalAxiosRequestConfig & { __debugStart?: number };
api.interceptors.request.use(
  (config) => {
    if (config.data && typeof config.data === 'object') {
      config.data = convertKeysToSnake(config.data);
    }
    if (isDebugEnabled('global')) {
      (config as DebugConfig).__debugStart = performance.now();
      useDebugStore.getState().pushEvent({
        kind: 'request',
        method: config.method?.toUpperCase(),
        url: config.url,
        payload: config.data,
      });
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - snake_case → camelCase 자동 변환 + debug 로깅
api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object' && !(response.data instanceof Blob)) {
      response.data = convertKeys(response.data);
    }
    if (isDebugEnabled('global')) {
      const start = (response.config as DebugConfig).__debugStart;
      useDebugStore.getState().pushEvent({
        kind: 'response',
        method: response.config.method?.toUpperCase(),
        url: response.config.url,
        status: response.status,
        durationMs: start ? Math.round(performance.now() - start) : undefined,
      });
    }
    return response;
  },
  (error) => {
    if (isDebugEnabled('global')) {
      const start = (error?.config as DebugConfig | undefined)?.__debugStart;
      useDebugStore.getState().pushEvent({
        kind: 'error',
        method: error?.config?.method?.toUpperCase(),
        url: error?.config?.url,
        status: error?.response?.status,
        durationMs: start ? Math.round(performance.now() - start) : undefined,
        message: error?.response?.data?.detail ?? error?.message,
      });
    }
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Clusters API
export const clustersApi = {
  getAll: () => api.get<ApiResponse<Cluster[]>>('/clusters'),
  getById: (id: string) => api.get<ApiResponse<Cluster>>(`/clusters/${id}`),
  create: (data: Partial<Cluster> & { kubeconfigContent?: string; skipConnectivityCheck?: boolean }) =>
    api.post<ApiResponse<Cluster>>('/clusters', data),
  update: (id: string, data: Partial<Cluster>) => api.put<ApiResponse<Cluster>>(`/clusters/${id}`, data),
  delete: (id: string) => api.delete(`/clusters/${id}`),
  getKubeconfig: (id: string) =>
    api.get<{ content: string; path: string }>(`/clusters/${id}/kubeconfig`),
  updateKubeconfig: (id: string, content: string) =>
    api.put<{ content: string; path: string }>(`/clusters/${id}/kubeconfig`, { content }),
  verify: (id: string) =>
    api.post<{ ok: boolean; cluster_name: string; results: { check: string; ok: boolean | null; detail: string }[] }>(`/clusters/${id}/verify`),
  autoUpdate: (id: string, opts?: { dryRun?: boolean; signal?: AbortSignal }) =>
    api.post<{
      clusterId: string;
      clusterName: string;
      dryRun?: boolean;
      updated?: Record<string, unknown>;
      current?: Record<string, unknown>;
      proposed?: Record<string, unknown>;
      diff?: { field: string; current: unknown; proposed: unknown; changed: boolean }[];
      warnings: string[];
    }>(`/clusters/${id}/auto-update`, undefined, {
      params: opts?.dryRun ? { dry_run: 'true' } : undefined,
      signal: opts?.signal,
    }),
  getCiliumConfig: (id: string) =>
    api.get<{ live: string | null; stored: string | null; source: string; error: string | null }>(`/clusters/${id}/cilium-config`),
  updateCustomValues: (id: string, values: Record<string, unknown>) =>
    api.put<{ clusterId: string; customValues: Record<string, unknown> }>(
      `/clusters/${id}/custom-values`, { values },
    ),
};

// Cluster 커스텀 컬럼 (Confluence 스타일)
export const clusterCustomFieldsApi = {
  list: () =>
    api.get<{ data: import('@/types').ClusterCustomField[] }>('/cluster-custom-fields'),
  create: (data: import('@/types').ClusterCustomFieldCreate) =>
    api.post<import('@/types').ClusterCustomField>('/cluster-custom-fields', data),
  update: (id: string, data: import('@/types').ClusterCustomFieldUpdate) =>
    api.put<import('@/types').ClusterCustomField>(`/cluster-custom-fields/${id}`, data),
  delete: (id: string) =>
    api.delete(`/cluster-custom-fields/${id}`),
};

// Versions API — 클러스터 컴포넌트 버전/설정 스냅샷 수집 & 히스토리
export interface ComponentSnapshot {
  id: string;
  component: string;
  category: string | null;
  version: string | null;
  data: Record<string, unknown>;
  contentHash?: string;
  collectedAt: string;
}

export interface VersionGraphNode {
  id: string;
  label: string;
  type: 'cluster' | 'category' | 'component' | 'flag';
  category?: string;
  version?: string | null;
  value?: string;
  collectedAt?: string;
}

export interface VersionGraphEdge {
  source: string;
  target: string;
  type: 'contains' | 'param' | 'configures' | 'replaces';
}

export const versionsApi = {
  collect: (clusterId: string, signal?: AbortSignal) =>
    api.post<{ clusterId: string; changed: number; errors: string[]; collectedAt: string }>(
      `/clusters/${clusterId}/collect-versions`, undefined, { signal },
    ),
  collectEtcdSystemd: (clusterId: string, payload: import('@/types').EtcdSystemdCollectRequest, signal?: AbortSignal) =>
    api.post<import('@/types').EtcdSystemdCollectResponse>(
      `/clusters/${clusterId}/collect-etcd-systemd`, payload, { signal },
    ),
  collectKernelParams: (
    clusterId: string,
    payload: import('@/types').KernelParamsCollectRequest,
    signal?: AbortSignal,
  ) =>
    api.post<import('@/types').KernelParamsCollectResponse>(
      `/clusters/${clusterId}/collect-kernel-params`, payload, { signal },
    ),
  collectEtcdctlConfig: (
    clusterId: string,
    payload: import('@/types').EtcdctlConfigCollectRequest,
    signal?: AbortSignal,
  ) =>
    api.post<import('@/types').EtcdctlConfigCollectResponse>(
      `/clusters/${clusterId}/collect-etcdctl-config`, payload, { signal },
    ),
  current: (clusterId: string) =>
    api.get<{ clusterId: string; components: ComponentSnapshot[] }>(
      `/clusters/${clusterId}/versions/current`,
    ),
  history: (clusterId: string, component?: string, limit = 200) => {
    const q = new URLSearchParams();
    if (component) q.set('component', component);
    q.set('limit', String(limit));
    return api.get<{ clusterId: string; component: string | null; snapshots: ComponentSnapshot[] }>(
      `/clusters/${clusterId}/versions/history?${q.toString()}`,
    );
  },
  diff: (clusterId: string, fromId: string, toId: string) =>
    api.get<{
      from: { id: string; component: string; version: string | null; collectedAt: string };
      to: { id: string; component: string; version: string | null; collectedAt: string };
      versionChanged: boolean;
      changes: { key: string; from: unknown; to: unknown }[];
    }>(`/clusters/${clusterId}/versions/diff?from=${fromId}&to=${toId}`),
  graph: (clusterId: string) =>
    api.get<{
      clusterId: string;
      clusterName: string;
      nodes: VersionGraphNode[];
      edges: VersionGraphEdge[];
    }>(`/clusters/${clusterId}/versions/graph`),
};

// Bulk SSH/SCP API
export interface NodeSummary {
  name: string;
  internalIp?: string | null;
  externalIp?: string | null;
  roles: string[];
  ready: boolean;
  os?: string | null;
  kubeletVersion?: string | null;
}

export interface BulkExecResultItem {
  host: string;
  status: 'ok' | 'error' | 'timeout' | 'auth_error' | 'connect_error';
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string | null;
}

export interface BulkExecResponse {
  action: 'ssh' | 'scp';
  mode: 'sequential' | 'parallel';
  total: number;
  okCount: number;
  errorCount: number;
  totalDurationMs: number;
  results: BulkExecResultItem[];
}

export interface BulkExecRequest {
  clusterId?: string;
  action: 'ssh' | 'scp';
  targets: { host: string; username?: string; port?: number }[];
  username: string;
  port: number;
  password?: string;
  privateKey?: string;
  command?: string;
  scpContent?: string;
  scpRemotePath?: string;
  mode: 'sequential' | 'parallel';
  parallelism: number;
  connectTimeout: number;
  execTimeout: number;
}

export const bulkExecApi = {
  nodeList: (clusterId: string) =>
    api.get<{ clusterId: string; clusterName: string; nodes: NodeSummary[] }>(
      `/clusters/${clusterId}/node-list`,
    ),
  run: (payload: BulkExecRequest, signal?: AbortSignal) =>
    api.post<BulkExecResponse>('/bulk-exec/run', payload, { signal }),
};

// etcdctl API
export interface EtcdMasterCandidate {
  name: string;
  internalIp?: string | null;
  externalIp?: string | null;
}

export interface EtcdPreset {
  key: string;
  label: string;
  args: string;
}

export interface EtcdCtlRunResponse {
  host: string;
  status: 'ok' | 'error' | 'timeout' | 'auth_error' | 'connect_error';
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string | null;
  executedCommand: string;
}

export interface EtcdCtlRunRequest {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  args: string;
  envFile: string;
  useEnv: boolean;
  extraEnv?: Record<string, string>;
  etcdctlPath: string;
  timeout: number;
}

export interface EtcdLogsRequest {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  unit: string;
  tail: number;
  since?: string;
  grep?: string;
}

export interface McPreset {
  key: string;
  label: string;
  args: string;
}

export interface McRunRequest {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  args: string;
  alias: string;
  mcPath: string;
  extraEnv?: Record<string, string>;
  timeout: number;
}

export const mcApi = {
  presets: (clusterId: string) =>
    api.get<{ presets: McPreset[] }>(`/clusters/${clusterId}/mc/presets`),
  run: (clusterId: string, payload: McRunRequest, signal?: AbortSignal) =>
    api.post<EtcdCtlRunResponse>(`/clusters/${clusterId}/mc/run`, payload, { signal }),
};

export const etcdctlApi = {
  presets: (clusterId: string) =>
    api.get<{ presets: EtcdPreset[] }>(`/clusters/${clusterId}/etcdctl/presets`),
  masters: (clusterId: string) =>
    api.get<{ clusterId: string; clusterName: string; candidates: EtcdMasterCandidate[] }>(
      `/clusters/${clusterId}/etcdctl/master-candidates`,
    ),
  run: (clusterId: string, payload: EtcdCtlRunRequest, signal?: AbortSignal) =>
    api.post<EtcdCtlRunResponse>(`/clusters/${clusterId}/etcdctl/run`, payload, { signal }),
  logs: (clusterId: string, payload: EtcdLogsRequest, signal?: AbortSignal) =>
    api.post<EtcdCtlRunResponse>(`/clusters/${clusterId}/etcdctl/logs`, payload, { signal }),
};

// Health API
export const healthApi = {
  runCheck: (clusterId: string) => api.post<ApiResponse<void>>(`/health/check/${clusterId}`),
  runAddonCheck: (clusterId: string, addonId: string) =>
    api.post<ApiResponse<void>>(`/health/check/${clusterId}/addons/${addonId}`),
  getStatus: (clusterId: string) => api.get<ApiResponse<Cluster>>(`/health/status/${clusterId}`),
  getAddons: (clusterId: string) => api.get<ApiResponse<Addon[]>>(`/health/addons/${clusterId}`),
  getSummary: () => api.get<ApiResponse<SummaryStats>>('/health/summary'),
  exportReport: (clusterId?: string, fmt: 'md' | 'csv' = 'md') =>
    api.get('/health/report', {
      params: { ...(clusterId ? { cluster_id: clusterId } : {}), fmt },
      responseType: 'blob',
    }),
  createAddon: (data: Partial<Addon>) => api.post<ApiResponse<Addon>>('/health/addons', data),
  updateAddon: (addonId: string, data: Partial<Addon>) => api.put<ApiResponse<Addon>>(`/health/addons/${addonId}`, data),
  deleteAddon: (addonId: string) => api.delete(`/health/addons/${addonId}`),
};

// History API
export const historyApi = {
  getLogs: (clusterId?: string, page = 1, pageSize = 20) =>
    api.get<PaginatedResponse<CheckLog>>('/history', {
      params: { clusterId, page, pageSize },
    }),
  exportCsv: (clusterId: string) =>
    api.get(`/history/${clusterId}/export`, { responseType: 'blob' }),
};

// Playbooks API
export const playbooksApi = {
  getAll: (clusterId?: string) =>
    api.get<ApiResponse<Playbook[]>>('/playbooks', {
      params: clusterId ? { clusterId } : {},
    }),
  getById: (id: string) => api.get<ApiResponse<Playbook>>(`/playbooks/${id}`),
  create: (data: Partial<Playbook>) => api.post<ApiResponse<Playbook>>('/playbooks', data),
  update: (id: string, data: Partial<Playbook>) =>
    api.put<ApiResponse<Playbook>>(`/playbooks/${id}`, data),
  delete: (id: string) => api.delete(`/playbooks/${id}`),
  run: (id: string) => api.post<PlaybookRunResult>(`/playbooks/${id}/run`),
  toggleDashboard: (id: string) => api.patch<ApiResponse<Playbook>>(`/playbooks/${id}/dashboard`),
  getDashboard: (clusterId: string) => api.get<ApiResponse<Playbook[]>>(`/playbooks/dashboard/${clusterId}`),
  exportReport: (clusterId?: string) =>
    api.get('/playbooks/report', {
      params: clusterId ? { cluster_id: clusterId } : {},
      responseType: 'blob',
    }),
};

// Agent API (AI Mode — fail-safe)
export const agentApi = {
  chat: (data: AgentChatRequest) =>
    api.post<AgentChatResponse>('/agent/chat', data, { timeout: 120000 }),
  health: () =>
    api.get<AgentHealthResponse>('/agent/health', { timeout: 5000 }),
};

// PromQL Metric Cards API
export const promqlApi = {
  getCards: (category?: string) =>
    api.get<{ data: MetricCard[] }>('/promql/cards', {
      params: category ? { category } : {},
    }),
  getCard: (id: string) => api.get<MetricCard>(`/promql/cards/${id}`),
  createCard: (data: Partial<MetricCard>) =>
    api.post<MetricCard>('/promql/cards', data),
  updateCard: (id: string, data: Partial<MetricCard>) =>
    api.put<MetricCard>(`/promql/cards/${id}`, data),
  deleteCard: (id: string) => api.delete(`/promql/cards/${id}`),
  queryCard: (id: string) =>
    api.get<MetricQueryResult>(`/promql/query/${id}`),
  queryAll: () =>
    api.get<MetricQueryResult[]>('/promql/query/all'),
  testQuery: (promql: string) =>
    api.post<MetricQueryResult>('/promql/query/test', { promql }),
  health: () =>
    api.get<{ status: string; detail?: string }>('/promql/health', { timeout: 5000 }),
};

// Issues API
export const issuesApi = {
  getAll: (params?: {
    clusterId?: string;
    assignee?: string;
    issueArea?: string;
    occurredFrom?: string;
    occurredTo?: string;
  }) =>
    api.get<IssueListResponse>('/issues', {
      params: params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [toSnakeCase(k), v])
          )
        : undefined,
    }),
  getById: (id: string) => api.get<Issue>(`/issues/${id}`),
  create: (data: IssueCreate) => api.post<Issue>('/issues', data),
  update: (id: string, data: IssueUpdate) => api.put<Issue>(`/issues/${id}`, data),
  delete: (id: string) => api.delete(`/issues/${id}`),
  exportCsv: (params?: {
    clusterId?: string;
    assignee?: string;
    issueArea?: string;
    occurredFrom?: string;
    occurredTo?: string;
  }) =>
    api.get('/issues/export/csv', {
      params: params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [toSnakeCase(k), v])
          )
        : undefined,
      responseType: 'blob',
    }),
};

// Today Tasks Summary (ToDoToday Board)
export interface TodayTaskGroup {
  assignee: string;
  todayTasks: Task[];
  inProgressTasks: Task[];
}

export interface TodayTasksSummary {
  date: string;
  totalToday: number;
  totalInProgress: number;
  groups: TodayTaskGroup[];
}

export const todayTasksApi = {
  getSummary: (date?: string) =>
    api.get<TodayTasksSummary>('/tasks/today/summary', { params: date ? { date } : {} }),
};

// Tasks API
export const tasksApi = {
  getAll: (params?: {
    clusterId?: string;
    assignee?: string;
    taskCategory?: string;
    priority?: string;
    kanbanStatus?: string;
    module?: string;
    scheduledFrom?: string;
    scheduledTo?: string;
    completed?: boolean;
  }) =>
    api.get<TaskListResponse>('/tasks', {
      params: params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [toSnakeCase(k), v])
          )
        : undefined,
    }),
  getById: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (data: TaskCreate) => api.post<Task>('/tasks', data),
  update: (id: string, data: TaskUpdate) => api.put<Task>(`/tasks/${id}`, data),
  patchStatus: (id: string, kanbanStatus: KanbanStatus) =>
    api.patch<TaskStatusResponse>(`/tasks/${id}/status`, { kanban_status: kanbanStatus }),
  delete: (id: string) => api.delete(`/tasks/${id}`),
  exportCsv: (params?: {
    clusterId?: string;
    assignee?: string;
    taskCategory?: string;
    priority?: string;
    kanbanStatus?: string;
    module?: string;
    scheduledFrom?: string;
    scheduledTo?: string;
  }) =>
    api.get('/tasks/export/csv', {
      params: params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [toSnakeCase(k), v])
          )
        : undefined,
      responseType: 'blob',
    }),
};

export const uiSettingsApi = {
  get: () => api.get<UiSettings>('/ui-settings'),
  update: (data: Partial<UiSettings>) => api.put<UiSettings>('/ui-settings', data),
  getClusterLinks: () => api.get<{ data: ClusterLinksPayload }>('/ui-settings/cluster-links'),
  updateClusterLinks: (data: ClusterLinksPayload) => api.put<{ data: ClusterLinksPayload }>('/ui-settings/cluster-links', data),
};

export const nodeLabelsApi = {
  getNodes: (clusterId: string) =>
    api.get(`/clusters/${clusterId}/nodes`),
  patchNodeLabels: (
    clusterId: string,
    nodeName: string,
    payload: { add: Record<string, string>; remove: string[] }
  ) =>
    api.patch(
      `/clusters/${clusterId}/nodes/${encodeURIComponent(nodeName)}/labels`,
      payload
    ),
};


// Workflows API
export const workflowsApi = {
  getAll: () => api.get<{ data: import('@/types').Workflow[] }>('/workflows'),
  getById: (id: string) => api.get<import('@/types').Workflow>(`/workflows/${id}`),
  create: (data: import('@/types').WorkflowCreate) => api.post<import('@/types').Workflow>('/workflows', data),
  update: (id: string, data: import('@/types').WorkflowUpdate) => api.put<import('@/types').Workflow>(`/workflows/${id}`, data),
  delete: (id: string) => api.delete(`/workflows/${id}`),
  createStep: (workflowId: string, data: import('@/types').WorkflowStepCreate) =>
    api.post<import('@/types').WorkflowStep>(`/workflows/${workflowId}/steps`, data),
  updateStep: (workflowId: string, stepId: string, data: import('@/types').WorkflowStepUpdate) =>
    api.put<import('@/types').WorkflowStep>(`/workflows/${workflowId}/steps/${stepId}`, data),
  deleteStep: (workflowId: string, stepId: string) =>
    api.delete(`/workflows/${workflowId}/steps/${stepId}`),
  createEdge: (workflowId: string, data: import('@/types').WorkflowEdgeCreate) =>
    api.post<import('@/types').WorkflowEdge>(`/workflows/${workflowId}/edges`, data),
  deleteEdge: (workflowId: string, edgeId: string) =>
    api.delete(`/workflows/${workflowId}/edges/${edgeId}`),
};

// Work Guides API
export const workGuidesApi = {
  getAll: (params?: { category?: string; status?: string; priority?: string }) =>
    api.get<WorkGuideListResponse>('/work-guides', {
      params: params
        ? Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [toSnakeCase(k === 'status' ? 'guide_status' : k), v])
          )
        : undefined,
    }),
  getById: (id: string) => api.get<WorkGuide>(`/work-guides/${id}`),
  create: (data: WorkGuideCreate) => api.post<WorkGuide>('/work-guides', data),
  update: (id: string, data: WorkGuideUpdate) => api.put<WorkGuide>(`/work-guides/${id}`, data),
  delete: (id: string) => api.delete(`/work-guides/${id}`),
};

// Ops Notes API (업무 게시판)
export const opsNotesApi = {
  getAll: (service?: string) =>
    api.get<OpsNoteListResponse>('/ops-notes', {
      params: service ? { service } : undefined,
    }),
  getById: (id: string) => api.get<OpsNote>(`/ops-notes/${id}`),
  create: (data: OpsNoteCreate) => api.post<OpsNote>('/ops-notes', data),
  update: (id: string, data: OpsNoteUpdate) => api.put<OpsNote>(`/ops-notes/${id}`, data),
  delete: (id: string) => api.delete(`/ops-notes/${id}`),
};

// Mind Map API
export const mindmapApi = {
  list: () => api.get<MindMapListItem[]>('/mindmaps/'),
  get: (id: string) => api.get<MindMap>(`/mindmaps/${id}`),
  create: (data: MindMapCreate) => api.post<MindMap>('/mindmaps/', data),
  update: (id: string, data: MindMapUpdate) => api.put<MindMap>(`/mindmaps/${id}`, data),
  delete: (id: string) => api.delete(`/mindmaps/${id}`),
  // nodes
  createNode: (mapId: string, data: MindMapNodeCreate) =>
    api.post<MindMapNode>(`/mindmaps/${mapId}/nodes`, data),
  updateNode: (mapId: string, nodeId: string, data: MindMapNodeUpdate) =>
    api.put<MindMapNode>(`/mindmaps/${mapId}/nodes/${nodeId}`, data),
  deleteNode: (mapId: string, nodeId: string) =>
    api.delete(`/mindmaps/${mapId}/nodes/${nodeId}`),
  bulkUpdatePositions: (mapId: string, updates: { id: string; x: number; y: number }[]) =>
    api.patch<MindMapNode[]>(`/mindmaps/${mapId}/nodes/positions`, updates),
};

// Management Servers API
export const managementServersApi = {
  getAll: (serverType?: string) =>
    api.get<ManagementServerListResponse>('/management-servers', {
      params: serverType ? { server_type: serverType } : {},
    }),
  getById: (id: string) => api.get<ManagementServer>(`/management-servers/${id}`),
  create: (data: ManagementServerCreate) => api.post<ManagementServer>('/management-servers', data),
  update: (id: string, data: ManagementServerUpdate) =>
    api.put<ManagementServer>(`/management-servers/${id}`, data),
  delete: (id: string) => api.delete(`/management-servers/${id}`),
  ping: (id: string) =>
    api.post<{ ok: boolean; host: string; port: number; latency_ms: number | null; detail: string }>(
      `/management-servers/${id}/ping`
    ),
};

// Infra Nodes API (물리 서버 노드)
export const infraNodesApi = {
  getAll: (params?: { clusterId?: string; rackName?: string }) =>
    api.get<import('@/types').InfraNodeListResponse>('/infra-nodes', { params, headers: { 'X-API-Scopes': 'infra_topology.read' } }),
  getById: (id: string) => api.get<import('@/types').InfraNode>(`/infra-nodes/${id}`, { headers: { 'X-API-Scopes': 'infra_topology.read' } }),
  create: (data: import('@/types').InfraNodeCreate) =>
    api.post<import('@/types').InfraNode>('/infra-nodes', data, { headers: { 'X-API-Scopes': 'infra_topology.edit' } }),
  update: (id: string, data: import('@/types').InfraNodeUpdate) =>
    api.put<import('@/types').InfraNode>(`/infra-nodes/${id}`, data, { headers: { 'X-API-Scopes': 'infra_topology.edit' } }),
  delete: (id: string) => api.delete(`/infra-nodes/${id}`, { headers: { 'X-API-Scopes': 'infra_topology.force_fix' } }),
  sync: (clusterId: string) =>
    api.post<import('@/types').InfraSyncResult>(`/infra-nodes/sync/${clusterId}`, undefined, { headers: { 'X-API-Scopes': 'infra_topology.sync' } }),
};

// Node Server Spec (자산 관리 대장)
export const nodeSpecsApi = {
  list: (params?: { clusterId?: string; status?: string; role?: string; search?: string }, signal?: AbortSignal) =>
    api.get<import('@/types').NodeServerSpecListResponse>('/node-specs', {
      params: params
        ? {
            cluster_id: params.clusterId,
            status: params.status,
            role: params.role,
            search: params.search,
          }
        : undefined,
      signal,
    }),
  getById: (id: string) =>
    api.get<import('@/types').NodeServerSpec>(`/node-specs/${id}`),
  create: (data: import('@/types').NodeServerSpecCreate) =>
    api.post<import('@/types').NodeServerSpec>('/node-specs', data),
  update: (id: string, data: import('@/types').NodeServerSpecUpdate) =>
    api.put<import('@/types').NodeServerSpec>(`/node-specs/${id}`, data),
  delete: (id: string) =>
    api.delete(`/node-specs/${id}`),
  importFromCluster: (
    clusterId: string,
    payload: import('@/types').NodeSpecImportRequest = {},
    signal?: AbortSignal,
  ) =>
    api.post<import('@/types').NodeSpecImportResult>(`/node-specs/import/${clusterId}`, payload, { signal }),
  csvPreview: (
    payload: import('@/types').NodeSpecCsvUploadRequest,
    signal?: AbortSignal,
  ) =>
    api.post<import('@/types').NodeSpecCsvPreviewResponse>('/node-specs/csv/preview', payload, { signal }),
  csvApply: (
    payload: import('@/types').NodeSpecCsvUploadRequest,
    signal?: AbortSignal,
  ) =>
    api.post<import('@/types').NodeSpecCsvApplyResponse>('/node-specs/csv/apply', payload, { signal }),
};


// Topology Trace API
export const topologyTraceApi = {
  trace: (payload: TopologyTraceRequest) =>
    api.post<TopologyTraceResponse>('/topology-trace', payload),
  packetFlow: (payload: import('@/types').PacketFlowRequest) =>
    api.post<import('@/types').PacketFlowResponse>('/topology-trace/packet-flow', payload),
  packetFlowV2: (payload: import('@/types').PacketFlowRequestV2, signal?: AbortSignal) =>
    api.post<import('@/types').PacketFlowResponseV2>('/topology-trace/packet-flow-v2', payload, { signal }),
  hubbleFlows: (payload: import('@/types').HubbleFlowsRequest, signal?: AbortSignal) =>
    api.post<import('@/types').HubbleFlowsResponse>('/topology-trace/hubble-flows', payload, { signal }),
  tcpdumpRun: (payload: import('@/types').TcpdumpCaptureRequest, signal?: AbortSignal) =>
    api.post<import('@/types').TcpdumpCaptureResponse>('/topology-trace/tcpdump', payload, { signal }),
  tcpdumpInterfaces: (payload: import('@/types').TcpdumpInterfacesRequest, signal?: AbortSignal) =>
    api.post<import('@/types').TcpdumpInterfacesResponse>('/topology-trace/tcpdump/interfaces', payload, { signal }),
};

// Assignees API (담당자 관리)
export const assigneesApi = {
  getAll: () => api.get<{ data: import('@/types').Assignee[] }>('/ui-settings/assignees'),
  update: (assignees: import('@/types').Assignee[]) =>
    api.put<{ data: import('@/types').Assignee[] }>('/ui-settings/assignees', { assignees }),
};

// Ontology API
export const ontologyApi = {
  getGraph: (clusterId: string) =>
    api.get<import('@/types').OntologyGraph>(`/ontology/graph/${clusterId}`),
  createEntity: (data: {
    clusterId: string; entityType: string; name: string;
    externalId?: string; version?: string; properties?: Record<string, unknown>;
  }) => api.post<import('@/types').OntologyEntity>('/ontology/entities', data),
  createRelationship: (data: {
    clusterId: string; sourceEntityId: string; relationType: string;
    targetEntityId: string; weight?: number; relationMetadata?: Record<string, unknown>;
  }) => api.post<import('@/types').OntologyRelationship>('/ontology/relationships', data),
  analyzeImpact: (data: import('@/types').OntologyImpactRequest) =>
    api.post<import('@/types').OntologyImpactResponse>('/ontology/impact', data),
};

// Incident Analysis API
export const analyzeApi = {
  analyze: (data: import('@/types').IncidentAnalysisRequest) =>
    api.post<import('@/types').IncidentAnalysisResponse>('/analyze/incident', data),
  health: () =>
    api.get<import('@/types').AnalyzerHealthResponse>('/analyze/health'),
};

// Trend Digest API
export const trendsApi = {
  triggerCollect: (targetDate?: string) =>
    api.post<TrendDigest>('/trends/collect', undefined, {
      params: targetDate ? { target_date: targetDate } : {},
    }),
  listDigests: (limit = 30) =>
    api.get<TrendDigest[]>('/trends/digests', { params: { limit } }),
  getDigest: (date: string) =>
    api.get<TrendDigest>(`/trends/digests/${date}`),
  listItems: (date: string, category?: string, itemType?: string) =>
    api.get<TrendItem[]>(`/trends/items/${date}`, {
      params: { ...(category && { category }), ...(itemType && { item_type: itemType }) },
    }),
  listSources: () => api.get<TrendSource[]>('/trends/sources'),
  toggleSource: (id: string, enabled: boolean) =>
    api.patch<TrendSource>(`/trends/sources/${id}`, { enabled }),
  createSource: (data: {
    name: string; sourceType: 'github_release' | 'rss'; url: string; category: string; enabled?: boolean;
  }) => api.post<TrendSource>('/trends/sources', data),
  updateSource: (id: string, data: Partial<{
    name: string; sourceType: 'github_release' | 'rss'; url: string; category: string; enabled: boolean;
  }>) => api.put<TrendSource>(`/trends/sources/${id}`, data),
  deleteSource: (id: string) => api.delete(`/trends/sources/${id}`),
};

export default api;
