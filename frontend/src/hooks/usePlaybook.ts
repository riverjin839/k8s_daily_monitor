import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { playbooksApi } from '@/services/api';
import { usePlaybookStore } from '@/stores/playbookStore';
import { Playbook } from '@/types';

export const playbookKeys = {
  all: ['playbooks'] as const,
  byCluster: (clusterId: string) => ['playbooks', clusterId] as const,
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
