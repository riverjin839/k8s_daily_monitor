import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commandsApi } from '@/services/api';
import type { CommandEntryCreate } from '@/types';

export const commandKeys = {
  all: ['commands'] as const,
  list: (params?: { category?: string; importance?: string; q?: string }) =>
    ['commands', 'list', params ?? null] as const,
  detail: (id: string) => ['commands', 'detail', id] as const,
};

export function useCommands(params?: { category?: string; importance?: string; q?: string }) {
  return useQuery({
    queryKey: commandKeys.list(params),
    queryFn: async () => {
      const { data } = await commandsApi.list(params);
      return data;
    },
  });
}

export function useCreateCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CommandEntryCreate) => commandsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: commandKeys.all }),
  });
}

export function useUpdateCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CommandEntryCreate> }) =>
      commandsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: commandKeys.all }),
  });
}

export function useDeleteCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => commandsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: commandKeys.all }),
  });
}
