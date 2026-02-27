import axios from 'axios';
import { Cluster, Addon, CheckLog, SummaryStats, ApiResponse, PaginatedResponse, Playbook, PlaybookRunResult, AgentChatRequest, AgentChatResponse, AgentHealthResponse, MetricCard, MetricQueryResult, Issue, IssueListResponse, IssueCreate, IssueUpdate, Task, TaskListResponse, TaskCreate, TaskUpdate, UiSettings, ClusterLinksPayload } from '@/types';

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
  create: (data: Partial<Cluster> & { kubeconfigContent?: string }) =>
    api.post<ApiResponse<Cluster>>('/clusters', data),
  update: (id: string, data: Partial<Cluster>) => api.put<ApiResponse<Cluster>>(`/clusters/${id}`, data),
  delete: (id: string) => api.delete(`/clusters/${id}`),
  getKubeconfig: (id: string) =>
    api.get<{ content: string; path: string }>(`/clusters/${id}/kubeconfig`),
  updateKubeconfig: (id: string, content: string) =>
    api.put<{ content: string; path: string }>(`/clusters/${id}/kubeconfig`, { content }),
};

// Health API
export const healthApi = {
  runCheck: (clusterId: string) => api.post<ApiResponse<void>>(`/health/check/${clusterId}`),
  getStatus: (clusterId: string) => api.get<ApiResponse<Cluster>>(`/health/status/${clusterId}`),
  getAddons: (clusterId: string) => api.get<ApiResponse<Addon[]>>(`/health/addons/${clusterId}`),
  getSummary: () => api.get<ApiResponse<SummaryStats>>('/health/summary'),
  exportReport: (clusterId?: string, fmt: 'md' | 'csv' = 'md') =>
    api.get('/health/report', {
      params: { ...(clusterId ? { cluster_id: clusterId } : {}), fmt },
      responseType: 'blob',
    }),
  createAddon: (data: Partial<Addon>) => api.post<ApiResponse<Addon>>('/health/addons', data),
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

// Tasks API
export const tasksApi = {
  getAll: (params?: {
    clusterId?: string;
    assignee?: string;
    taskCategory?: string;
    priority?: string;
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
  delete: (id: string) => api.delete(`/tasks/${id}`),
  exportCsv: (params?: {
    clusterId?: string;
    assignee?: string;
    taskCategory?: string;
    priority?: string;
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

export default api;
