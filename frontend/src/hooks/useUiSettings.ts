import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uiSettingsApi } from '@/services/api';
import { ClusterLinksPayload, UiSettings } from '@/types';

export const uiSettingsKeys = {
  settings: ['uiSettings'] as const,
  clusterLinks: ['clusterLinks'] as const,
};

export function useUiSettings() {
  return useQuery({
    queryKey: uiSettingsKeys.settings,
    queryFn: async () => {
      const { data } = await uiSettingsApi.get();
      return data;
    },
  });
}

export function useUpdateUiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<UiSettings>) => uiSettingsApi.update(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uiSettingsKeys.settings });
    },
  });
}

export function useClusterLinks() {
  return useQuery({
    queryKey: uiSettingsKeys.clusterLinks,
    queryFn: async () => {
      const { data } = await uiSettingsApi.getClusterLinks();
      return data.data;
    },
  });
}

export function useUpdateClusterLinks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ClusterLinksPayload) => uiSettingsApi.updateClusterLinks(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: uiSettingsKeys.clusterLinks });
    },
  });
}
