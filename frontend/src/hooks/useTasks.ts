import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/services/api';
import { TaskCreate, TaskUpdate } from '@/types';

export const taskKeys = {
  all: ['tasks'] as const,
  filtered: (params: object) => ['tasks', params] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
};

interface TaskFilters {
  clusterId?: string;
  assignee?: string;
  taskCategory?: string;
  priority?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  completed?: boolean;
}

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: filters ? taskKeys.filtered(filters) : taskKeys.all,
    queryFn: async () => {
      const { data } = await tasksApi.getAll(filters);
      return data;
    },
    staleTime: 1000 * 30,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaskCreate) => tasksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
