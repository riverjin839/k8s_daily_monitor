import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import { IssueCreate, IssueUpdate } from '@/types';

export const issueKeys = {
  all: ['issues'] as const,
  filtered: (params: object) => ['issues', params] as const,
  detail: (id: string) => ['issues', 'detail', id] as const,
};

interface IssueFilters {
  clusterId?: string;
  assignee?: string;
  issueArea?: string;
  occurredFrom?: string;
  occurredTo?: string;
}

export function useIssues(filters?: IssueFilters) {
  return useQuery({
    queryKey: filters ? issueKeys.filtered(filters) : issueKeys.all,
    queryFn: async () => {
      const { data } = await issuesApi.getAll(filters);
      return data;
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IssueCreate) => issuesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IssueUpdate }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => issuesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}
