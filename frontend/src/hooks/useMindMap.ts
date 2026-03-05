import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mindmapApi } from '@/services/api';
import type { MindMapCreate, MindMapUpdate, MindMapNodeCreate, MindMapNodeUpdate } from '@/types';

const keys = {
  all: ['mindmaps'] as const,
  detail: (id: string) => ['mindmaps', id] as const,
};

export function useMindMaps() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () => mindmapApi.list().then((r) => r.data),
  });
}

export function useMindMap(id: string | null) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => mindmapApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateMindMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MindMapCreate) => mindmapApi.create(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateMindMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MindMapUpdate }) =>
      mindmapApi.update(id, data).then((r) => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: keys.all });
      qc.invalidateQueries({ queryKey: keys.detail(id) });
    },
  });
}

export function useDeleteMindMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mindmapApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateNode(mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MindMapNodeCreate) => mindmapApi.createNode(mapId, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.detail(mapId) }),
  });
}

export function useUpdateNode(mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, data }: { nodeId: string; data: MindMapNodeUpdate }) =>
      mindmapApi.updateNode(mapId, nodeId, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.detail(mapId) }),
  });
}

export function useDeleteNode(mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => mindmapApi.deleteNode(mapId, nodeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.detail(mapId) }),
  });
}

export function useBulkUpdatePositions(mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: { id: string; x: number; y: number }[]) =>
      mindmapApi.bulkUpdatePositions(mapId, updates).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.detail(mapId) }),
  });
}
