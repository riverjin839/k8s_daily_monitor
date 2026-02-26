import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nodeLabelsApi } from '@/services/api';

export interface NodeInfo {
  name: string;
  labels: Record<string, string>;
  taints: string[];
  role: string;
  status: string;
}

export interface NodeLabelPatchPayload {
  add: Record<string, string>;
  remove: string[];
}

export const nodeLabelKeys = {
  list: (clusterId: string) => ['nodes', clusterId] as const,
};

export function useNodeList(clusterId: string) {
  return useQuery({
    queryKey: nodeLabelKeys.list(clusterId),
    queryFn: async () => {
      const { data } = await nodeLabelsApi.getNodes(clusterId);
      return data.data as NodeInfo[];
    },
    enabled: !!clusterId,
    refetchInterval: 30000,
  });
}

export function usePatchNodeLabels(clusterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeName, payload }: { nodeName: string; payload: NodeLabelPatchPayload }) =>
      nodeLabelsApi.patchNodeLabels(clusterId, nodeName, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeLabelKeys.list(clusterId) });
    },
  });
}
