import axios from 'axios';
import { Cluster, Addon, CheckLog, SummaryStats, ApiResponse, PaginatedResponse, Playbook, PlaybookRunResult, AgentChatRequest, AgentChatResponse, AgentHealthResponse, MetricCard, MetricQueryResult, Issue, IssueListResponse, IssueCreate, IssueUpdate, Task, TaskListResponse, TaskCreate, TaskUpdate, TaskStatusResponse, KanbanStatus, UiSettings, ClusterLinksPayload, WorkGuide, WorkGuideCreate, WorkGuideUpdate, WorkGuideListResponse, OpsNote, OpsNoteCreate, OpsNoteUpdate, OpsNoteListResponse, MindMap, MindMapListItem, MindMapCreate, MindMapUpdate, MindMapNode, MindMapNodeCreate, MindMapNodeUpdate, ManagementServer, ManagementServerCreate, ManagementServerUpdate, ManagementServerListResponse } from '@/types';

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

// Request interceptor - camelCase → snake_case 자동 변환
api.interceptors.request.use(
  (config) => {
    if (config.data && typeof config.data === 'object') {
      config.data = convertKeysToSnake(config.data);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - snake_case → camelCase 자동 변환
api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object' && !(response.data instanceof Blob)) {
      response.data = convertKeys(response.data);
    }
    return response;
  },
  (error) => {
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
  getCiliumConfig: (id: string) =>
    api.get<{ live: string | null; stored: string | null; source: string; error: string | null }>(`/clusters/${id}/cilium-config`),
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

// Assignees API (담당자 관리)
export const assigneesApi = {
  getAll: () => api.get<{ data: import('@/types').Assignee[] }>('/ui-settings/assignees'),
  update: (assignees: import('@/types').Assignee[]) =>
    api.put<{ data: import('@/types').Assignee[] }>('/ui-settings/assignees', { assignees }),
};

export default api;
