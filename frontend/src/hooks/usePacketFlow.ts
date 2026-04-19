import { useMutation } from '@tanstack/react-query';
import { topologyTraceApi } from '@/services/api';
import type { PacketFlowRequest } from '@/types';

export function usePacketFlow() {
  return useMutation({
    mutationFn: (payload: PacketFlowRequest) =>
      topologyTraceApi.packetFlow(payload).then((r) => r.data),
  });
}
