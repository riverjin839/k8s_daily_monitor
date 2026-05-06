import { useQuery } from '@tanstack/react-query';
import { nodeImagesApi } from '@/services/api';

export interface NodeImageEntry {
  names: string[];
  size_bytes: number;
}

export interface NodeImagesInfo {
  node: string;
  role: string;
  status: string;
  image_count: number;
  total_size_bytes: number;
  images: NodeImageEntry[];
}

export const nodeImageKeys = {
  list: (clusterId: string) => ['node-images', clusterId] as const,
};

export function useNodeImageList(clusterId: string) {
  return useQuery({
    queryKey: nodeImageKeys.list(clusterId),
    queryFn: async () => {
      const { data } = await nodeImagesApi.getNodeImages(clusterId);
      return data.data as NodeImagesInfo[];
    },
    enabled: !!clusterId,
    refetchInterval: 60000,
  });
}
