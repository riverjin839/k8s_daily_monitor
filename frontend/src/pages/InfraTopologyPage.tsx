import { Network } from 'lucide-react';

export function InfraTopologyPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-muted-foreground">
      <Network className="w-12 h-12 opacity-40" />
      <p className="text-lg font-medium">인프라 토폴로지</p>
      <p className="text-sm">준비 중입니다.</p>
    </div>
  );
}
