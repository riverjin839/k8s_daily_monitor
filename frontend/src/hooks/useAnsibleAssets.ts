import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ansibleAssetsApi } from '@/services/api';

const FILES_KEY = ['ansible', 'playbook-files'];
const invKey = (clusterId?: string) => ['ansible', 'inventories', clusterId ?? 'all'];

// ── Playbook Files (공용) ────────────────────────────────────────────

export function usePlaybookFiles() {
  return useQuery({
    queryKey: FILES_KEY,
    queryFn: () => ansibleAssetsApi.listFiles().then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useCreatePlaybookFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; content: string; tags?: string }) =>
      ansibleAssetsApi.createFile(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

export function useUpdatePlaybookFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; data: Partial<{ name: string; description: string; content: string; tags: string }> }) =>
      ansibleAssetsApi.updateFile(vars.id, vars.data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

export function useDeletePlaybookFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ansibleAssetsApi.deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

// ── Inventories (per cluster) ───────────────────────────────────────

export function useInventories(clusterId?: string) {
  return useQuery({
    queryKey: invKey(clusterId),
    queryFn: () => ansibleAssetsApi.listInventories(clusterId).then((r) => r.data),
    enabled: clusterId === undefined ? true : !!clusterId,
    staleTime: 30_000,
  });
}

export function useCreateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clusterId: string; name: string; description?: string; content: string; isDefault?: boolean }) =>
      ansibleAssetsApi.createInventory(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ansible', 'inventories'] }),
  });
}

export function useUpdateInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; data: Partial<{ name: string; description: string; content: string; isDefault: boolean }> }) =>
      ansibleAssetsApi.updateInventory(vars.id, vars.data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ansible', 'inventories'] }),
  });
}

export function useDeleteInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ansibleAssetsApi.deleteInventory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ansible', 'inventories'] }),
  });
}
