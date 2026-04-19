import { useMutation, useQuery } from '@tanstack/react-query';
import { analyzeApi } from '@/services/api';
import type { IncidentAnalysisRequest } from '@/types';

export function useAnalyzerHealth() {
  return useQuery({
    queryKey: ['analyzer', 'health'],
    queryFn: () => analyzeApi.health().then((r) => r.data),
    staleTime: 1000 * 60,
    retry: false,
  });
}

export function useAnalyzeIncident() {
  return useMutation({
    mutationFn: (context: IncidentAnalysisRequest) =>
      analyzeApi.analyze(context).then((r) => r.data),
  });
}
