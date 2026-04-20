import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ontologyApi } from '@/services/api';
import type { OntologyImpactRequest } from '@/types';

export function useOntologyGraph(clusterId: string | null) {
  return useQuery({
    queryKey: ['ontology', 'graph', clusterId],
    queryFn: () => ontologyApi.getGraph(clusterId!).then((r) => r.data),
    enabled: !!clusterId,
    staleTime: 1000 * 30,
  });
}

export function useAnalyzeImpact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OntologyImpactRequest) =>
      ontologyApi.analyzeImpact(data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ontology', 'graph', vars.clusterId] });
    },
  });
}
