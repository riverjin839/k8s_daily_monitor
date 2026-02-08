import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { playbooksApi } from '@/services/api';
import { usePlaybookStore } from '@/stores/playbookStore';
import { Playbook } from '@/types';

export const playbookKeys = {
  all: ['playbooks'] as const,
  byCluster: (clusterId: string) => ['playbooks', clusterId] as const,
  dashboard: (clusterId: string) => ['playbooks', 'dashboard', clusterId] as const,
  detail: (id: string) => ['playbooks', 'detail', id] as const,
};

export function usePlaybooks(clusterId?: string) {
  const { setPlaybooks } = usePlaybookStore();

  return useQuery({
    queryKey: clusterId ? playbookKeys.byCluster(clusterId) : playbookKeys.all,
    queryFn: async () => {
      const { data } = await playbooksApi.getAll(clusterId);
      const playbooks = data?.data ?? [];
      setPlaybooks(playbooks);
      return playbooks;
    },
    refetchInterval: 15000,
  });
}

export function useCreatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Playbook>) => playbooksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
  });
}

export function useUpdatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Playbook> }) =>
      playbooksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
  });
}

export function useDeletePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => playbooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
  });
}

export function useDashboardPlaybooks(clusterId: string) {
  return useQuery({
    queryKey: playbookKeys.dashboard(clusterId),
    queryFn: async () => {
      const { data } = await playbooksApi.getDashboard(clusterId);
      return data?.data ?? [];
    },
    enabled: !!clusterId,
    refetchInterval: 15000,
  });
}

export function useToggleDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => playbooksApi.toggleDashboard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
      // 모든 dashboard 쿼리도 invalidate
      queryClient.invalidateQueries({ queryKey: ['playbooks', 'dashboard'] });
    },
  });
}

export function useRunPlaybook() {
  const queryClient = useQueryClient();
  const { setRunning, clearRunning } = usePlaybookStore();

  return useMutation({
    mutationFn: (id: string) => {
      setRunning(id);
      return playbooksApi.run(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
    onSettled: (_, __, id) => {
      clearRunning(id);
    },
  });
}
