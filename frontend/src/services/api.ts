import axios from 'axios';
import { Cluster, Addon, CheckLog, SummaryStats, ApiResponse, PaginatedResponse } from '@/types';

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
    if (response.data && typeof response.data === 'object') {
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
  create: (data: Partial<Cluster>) => api.post<ApiResponse<Cluster>>('/clusters', data),
  update: (id: string, data: Partial<Cluster>) => api.put<ApiResponse<Cluster>>(`/clusters/${id}`, data),
  delete: (id: string) => api.delete(`/clusters/${id}`),
};

// Health API
export const healthApi = {
  runCheck: (clusterId: string) => api.post<ApiResponse<void>>(`/health/check/${clusterId}`),
  getStatus: (clusterId: string) => api.get<ApiResponse<Cluster>>(`/health/status/${clusterId}`),
  getAddons: (clusterId: string) => api.get<ApiResponse<Addon[]>>(`/health/addons/${clusterId}`),
  getSummary: () => api.get<ApiResponse<SummaryStats>>('/health/summary'),
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

export default api;
