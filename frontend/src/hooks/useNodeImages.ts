import { useQuery } from '@tanstack/react-query';
import { nodeImagesApi } from '@/services/api';

// services/api.ts 의 response interceptor 가 snake_case → camelCase 로 자동 변환하므로
// 프론트엔드 타입은 camelCase 로 정의해야 한다. (이전엔 snake_case 였고, 그 결과
// `imageCount`/`totalSizeBytes`/`sizeBytes` 가 undefined 로 읽혀 표시되지 않았음.)
export interface NodeImageEntry {
  names: string[];
  sizeBytes: number;
}

export interface NodeImagesInfo {
  node: string;
  role: string;
  status: string;
  imageCount: number;
  totalSizeBytes: number;
  /** 노드 라벨 — 라벨 기준 카드 그룹핑/필터링용 */
  labels: Record<string, string>;
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
