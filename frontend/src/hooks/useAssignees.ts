import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assigneesApi } from '@/services/api';
import type { Assignee } from '@/types';

export function useAssignees() {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: () => assigneesApi.getAll().then(r => r.data.data ?? []),
    staleTime: 60_000,
  });
}

export function useUpdateAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignees: Assignee[]) => assigneesApi.update(assignees),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignees'] }),
  });
}
