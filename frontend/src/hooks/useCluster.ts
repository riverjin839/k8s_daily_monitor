import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clustersApi, healthApi, historyApi } from '@/services/api';
import { useClusterStore } from '@/stores/clusterStore';
import { Cluster } from '@/types';

// Query Keys
export const queryKeys = {
  clusters: ['clusters'] as const,
  cluster: (id: string) => ['clusters', id] as const,
  addons: (clusterId: string) => ['addons', clusterId] as const,
  summary: ['summary'] as const,
  logs: (clusterId?: string) => ['logs', clusterId] as const,
};

// Clusters
export function useClusters() {
  const { setClusters } = useClusterStore();

  return useQuery({
    queryKey: queryKeys.clusters,
    queryFn: async () => {
      const { data } = await clustersApi.getAll();
      setClusters(data.data);
      return data.data;
    },
    refetchInterval: 30000, // 30초마다 자동 리페치
  });
}

export function useCluster(id: string) {
  return useQuery({
    queryKey: queryKeys.cluster(id),
    queryFn: async () => {
      const { data } = await clustersApi.getById(id);
      return data.data;
    },
    enabled: !!id,
  });
}

// Create Cluster
export function useCreateCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Cluster>) => clustersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clusters });
    },
  });
}

// Update Cluster
export function useUpdateCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Cluster> }) =>
      clustersApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cluster(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clusters });
    },
  });
}

// Delete Cluster
export function useDeleteCluster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => clustersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clusters });
    },
  });
}

// Summary
export function useSummary() {
  const { setSummary } = useClusterStore();

  return useQuery({
    queryKey: queryKeys.summary,
    queryFn: async () => {
      const { data } = await healthApi.getSummary();
      setSummary(data.data);
      return data.data;
    },
    refetchInterval: 30000,
  });
}

// Addons
export function useAddons(clusterId: string) {
  const { setAddons } = useClusterStore();

  return useQuery({
    queryKey: queryKeys.addons(clusterId),
    queryFn: async () => {
      const { data } = await healthApi.getAddons(clusterId);
      setAddons(clusterId, data.data);
      return data.data;
    },
    enabled: !!clusterId,
    refetchInterval: 30000,
  });
}

// Health Check
export function useHealthCheck() {
  const queryClient = useQueryClient();
  const { setIsChecking, setLastCheckTime } = useClusterStore();

  return useMutation({
    mutationFn: (clusterId: string) => healthApi.runCheck(clusterId),
    onMutate: () => {
      setIsChecking(true);
    },
    onSuccess: (_, clusterId) => {
      setLastCheckTime(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: queryKeys.cluster(clusterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.addons(clusterId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.summary });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs() });
    },
    onSettled: () => {
      setIsChecking(false);
    },
  });
}

// Logs
export function useLogs(clusterId?: string) {
  const { setLogs } = useClusterStore();

  return useQuery({
    queryKey: queryKeys.logs(clusterId),
    queryFn: async () => {
      const { data } = await historyApi.getLogs(clusterId);
      setLogs(data.data);
      return data;
    },
    refetchInterval: 30000,
  });
}
