import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deepCheckDefinitionsApi } from '@/services/api';
import type { DeepCheckDefinitionInput } from '@/types';

export const deepCheckDefinitionKeys = {
  list: (clusterId?: string) => ['deepCheckDefinitions', clusterId ?? 'all'] as const,
  checkTypes: ['deepCheckTypes'] as const,
};

export function useCheckTypes() {
  return useQuery({
    queryKey: deepCheckDefinitionKeys.checkTypes,
    queryFn: async () => {
      const { data } = await deepCheckDefinitionsApi.listCheckTypes();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeepCheckDefinitions(clusterId?: string, includeGlobal = true) {
  return useQuery({
    queryKey: deepCheckDefinitionKeys.list(clusterId),
    queryFn: async () => {
      const { data } = await deepCheckDefinitionsApi.list({
        clusterId,
        includeGlobal,
      });
      return data;
    },
  });
}

export function useCreateDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DeepCheckDefinitionInput) =>
      deepCheckDefinitionsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deepCheckDefinitions'] });
    },
  });
}

export function useUpdateDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeepCheckDefinitionInput }) =>
      deepCheckDefinitionsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deepCheckDefinitions'] });
    },
  });
}

export function useDeleteDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deepCheckDefinitionsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deepCheckDefinitions'] });
    },
  });
}

export function useTestDefinition() {
  return useMutation({
    mutationFn: ({ id, clusterId }: { id: string; clusterId?: string }) =>
      deepCheckDefinitionsApi.test(id, clusterId),
  });
}
