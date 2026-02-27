import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clustersApi, healthApi, historyApi } from '@/services/api';
import { useClusterStore } from '@/stores/clusterStore';
import { Cluster, Addon } from '@/types';

// Query Keys
export const queryKeys = {
  clusters: ['clusters'] as const,
  cluster: (id: string) => ['clusters', id] as const,
  addons: (clusterId: string) => ['addons', clusterId] as const,
  summary: ['summary'] as const,
  logs: (clusterId?: string) => ['logs', clusterId] as const,
  kubeconfig: (id: string) => ['kubeconfig', id] as const,
};

// Clusters
export function useClusters() {
  const { setClusters } = useClusterStore();

  return useQuery({
    queryKey: queryKeys.clusters,
    queryFn: async () => {
      const { data } = await clustersApi.getAll();
      const clusters = data?.data ?? [];
      setClusters(clusters);
      return clusters;
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
    mutationFn: (data: Partial<Cluster> & { kubeconfigContent?: string }) =>
      clustersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clusters });
    },
  });
}

// Kubeconfig
export function useKubeconfig(clusterId: string) {
  return useQuery({
    queryKey: queryKeys.kubeconfig(clusterId),
    queryFn: async () => {
      const { data } = await clustersApi.getKubeconfig(clusterId);
      return data;
    },
    enabled: !!clusterId,
    retry: false,
  });
}

export function useUpdateKubeconfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      clustersApi.updateKubeconfig(id, content),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kubeconfig(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.cluster(id) });
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
      // Backend /health/summary는 data wrapper 없이 직접 반환
      const raw = data?.data ?? data;
      const summary = {
        totalClusters: raw?.totalClusters ?? 0,
        healthy: raw?.healthy ?? 0,
        warning: raw?.warning ?? 0,
        critical: raw?.critical ?? 0,
      };
      setSummary(summary);
      return summary;
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
      const addons = data?.data ?? [];
      setAddons(clusterId, addons);
      return addons;
    },
    enabled: !!clusterId,
    refetchInterval: 30000,
  });
}

// Create Addon
export function useCreateAddon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Addon>) => healthApi.createAddon(data),
    onSuccess: (_, variables) => {
      const clusterId = variables.clusterId;
      if (clusterId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.addons(clusterId) });
      }
    },
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
    onSuccess: async (_, clusterId) => {
      setLastCheckTime(new Date().toISOString());
      // refetchQueries: invalidate + 즉시 refetch 보장
      await Promise.all([
        queryClient.refetchQueries({ queryKey: queryKeys.addons(clusterId) }),
        queryClient.refetchQueries({ queryKey: queryKeys.cluster(clusterId) }),
        queryClient.refetchQueries({ queryKey: queryKeys.summary }),
        queryClient.refetchQueries({ queryKey: queryKeys.logs() }),
      ]);
    },
    onError: (error) => {
      console.error('Health check failed:', error);
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
      const logs = data?.data ?? [];
      setLogs(logs);
      return data;
    },
    refetchInterval: 30000,
  });
}
