import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clusterCustomFieldsApi, clustersApi } from '@/services/api';
import type {
  ClusterCustomField, ClusterCustomFieldCreate, ClusterCustomFieldUpdate,
} from '@/types';

export function useClusterCustomFields() {
  return useQuery({
    queryKey: ['cluster-custom-fields'],
    queryFn: () => clusterCustomFieldsApi.list().then((r) => r.data.data),
    staleTime: 60_000,
  });
}

export function useCreateClusterCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClusterCustomFieldCreate) => clusterCustomFieldsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-custom-fields'] }),
  });
}

export function useUpdateClusterCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClusterCustomFieldUpdate }) =>
      clusterCustomFieldsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-custom-fields'] }),
  });
}

export function useDeleteClusterCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clusterCustomFieldsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cluster-custom-fields'] });
      qc.invalidateQueries({ queryKey: ['clusters'] });
    },
  });
}

export function useUpdateClusterCustomValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clusterId, values }: { clusterId: string; values: Record<string, unknown> }) =>
      clustersApi.updateCustomValues(clusterId, values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clusters'] }),
  });
}

// 유틸: 필드별 빈 값 렌더 대비 미리 정렬
export function sortedFields(fields: ClusterCustomField[] | undefined): ClusterCustomField[] {
  return [...(fields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}
