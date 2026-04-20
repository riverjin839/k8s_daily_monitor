import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trendsApi } from '@/services/api';

export function useTrendDigests(limit = 30) {
  return useQuery({
    queryKey: ['trends', 'digests', limit],
    queryFn: () => trendsApi.listDigests(limit).then((r) => r.data),
    staleTime: 1000 * 60 * 5,
  });
}

export function useTrendItems(date: string, category?: string, itemType?: string) {
  return useQuery({
    queryKey: ['trends', 'items', date, category, itemType],
    queryFn: () => trendsApi.listItems(date, category, itemType).then((r) => r.data),
    enabled: !!date,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTrendSources() {
  return useQuery({
    queryKey: ['trends', 'sources'],
    queryFn: () => trendsApi.listSources().then((r) => r.data),
    staleTime: 1000 * 60 * 10,
  });
}

export function useTriggerCollect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetDate?: string) =>
      trendsApi.triggerCollect(targetDate).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trends'] });
    },
  });
}

export function useToggleSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      trendsApi.toggleSource(id, enabled).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trends', 'sources'] });
    },
  });
}
