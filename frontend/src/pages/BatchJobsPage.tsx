// frontend/src/pages/BatchJobsPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { ListTree, Plus } from 'lucide-react';

import { MacCard } from '@/components/ui/MacCard';
import { ClusterSidebar, ConfirmDialog } from '@/components/common';
import { useClusters } from '@/hooks/useCluster';
import {
  useBatchJobTypes,
  useBatchJobs,
  useDeleteBatchJob,
} from '@/hooks/useBatchJobs';
import type { BatchJob } from '@/services/api';
import {
  BatchJobFilters,
  BatchJobSlideOver,
  BatchJobTable,
  CreateBatchJobWizard,
  FAILED_STATUSES,
  UnregisteredTypeChips,
  applyFilter,
  type FilterKey,
  type SortState,
} from '@/components/batch-jobs';

const DEFAULT_SORT: SortState = { key: 'lastRunAt', dir: 'desc' };

/** Tailwind 의 `xl` (1280px) 미만 — 슬라이드오버 overlay 모드 트리거. */
const OVERLAY_BREAKPOINT = '(max-width: 1279px)';

export function BatchJobsPage() {
  const { data: clusters = [] } = useClusters();
  const allJobsQ = useBatchJobs();
  const typesQ = useBatchJobTypes();
  const del = useDeleteBatchJob();

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null); // null = 전체
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [wizardCtx, setWizardCtx] = useState<{ clusterId?: string; jobType?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BatchJob | null>(null);

  const allJobs = useMemo(() => allJobsQ.data ?? [], [allJobsQ.data]);
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);

  // 클러스터 격리 후 필터/검색 적용.
  const scopedJobs = useMemo(() => {
    if (selectedClusterId === null) return allJobs;
    return allJobs.filter((j) => j.clusterId === selectedClusterId);
  }, [allJobs, selectedClusterId]);

  const visibleJobs = useMemo(
    () => applyFilter(scopedJobs, statusFilter, search),
    [scopedJobs, statusFilter, search],
  );

  // 잡이 사라지면 selectedJobId 자동 정리.
  const selectedJob = useMemo(
    () => allJobs.find((j) => j.id === selectedJobId) ?? null,
    [allJobs, selectedJobId],
  );
  useEffect(() => {
    if (selectedJobId && !selectedJob) setSelectedJobId(null);
  }, [selectedJobId, selectedJob]);

  // 좁은 뷰포트 (<1280px) 에서 슬라이드오버 overlay 모드.
  const [overlayMode, setOverlayMode] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(OVERLAY_BREAKPOINT);
    const sync = () => setOverlayMode(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const selectedCluster = useMemo(
    () =>
      selectedClusterId
        ? clusters.find((c) => c.id === selectedClusterId) ?? null
        : null,
    [selectedClusterId, clusters],
  );

  // 페이지 헤더 부제 텍스트.
  const headerSubtitle = useMemo(() => {
    if (selectedClusterId === null) {
      return `전체 ${clusters.length}개 클러스터 · 등록 잡 ${allJobs.length}`;
    }
    const c = selectedCluster;
    const stats = {
      total: scopedJobs.length,
      failed: scopedJobs.filter((j) => FAILED_STATUSES.has(j.lastStatus)).length,
      running: scopedJobs.filter((j) => j.lastStatus === 'running').length,
    };
    return `${c?.name ?? selectedClusterId}${c?.region ? ` · ${c.region}` : ''} · 잡 ${stats.total} · 실패 ${stats.failed} · 실행 중 ${stats.running}`;
  }, [selectedClusterId, selectedCluster, clusters.length, allJobs.length, scopedJobs]);

  const canCreate = clusters.length > 0 && types.length > 0;

  // "+ 새 잡" 헤더 버튼: 단일 모드면 그 cluster 로 prefilled, 전체 모드면 빈 wizard.
  const openCreateFromHeader = () => {
    setWizardCtx({ clusterId: selectedClusterId ?? undefined });
  };

  // 미등록 타입 칩에서 잡 타입 prefilled 로 진입.
  const openCreateFromMissingType = (jobType: string) => {
    setWizardCtx({ clusterId: selectedClusterId ?? undefined, jobType });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <ClusterSidebar
        clusters={clusters}
        selectedId={selectedClusterId}
        onSelect={(id) => setSelectedClusterId(id ?? null)}
        allowAll
        allLabel="전체"
        iconOnly
      />

      <main className="flex-1 min-w-0 px-4 lg:px-6 py-5 space-y-4 max-w-[1700px]">
        {/* Page Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ListTree className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight">Batch Jobs</h1>
              <p className="text-xs text-muted-foreground">{headerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateFromHeader}
            disabled={!canCreate}
            className="px-3.5 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl mac-shadow flex items-center gap-1.5 disabled:opacity-50"
            title={
              clusters.length === 0
                ? '먼저 클러스터를 등록하세요'
                : types.length === 0
                  ? '사용 가능한 잡 타입이 없습니다'
                  : '새 배치 잡 등록'
            }
          >
            <Plus className="w-3.5 h-3.5" />
            새 잡{selectedCluster ? ` (${selectedCluster.name})` : ''}
          </button>
        </div>

        {/* Body: 본문 + 슬라이드오버 */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0 space-y-4">
            <MacCard title="배치 잡" bodyPadding="p-4">
              {allJobsQ.isLoading ? (
                <p className="text-xs text-muted-foreground py-6 text-center">로딩 중…</p>
              ) : clusters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  등록된 클러스터가 없습니다. /cluster-manage 에서 추가하세요.
                </p>
              ) : types.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  사용 가능한 잡 타입이 없습니다 — 백엔드 batch-jobs/types 응답을 확인해 주세요.
                </p>
              ) : (
                <div className="space-y-4">
                  <BatchJobFilters
                    jobs={scopedJobs}
                    active={statusFilter}
                    onChange={setStatusFilter}
                    search={search}
                    onSearchChange={setSearch}
                  />
                  <BatchJobTable
                    jobs={visibleJobs}
                    clusters={selectedClusterId === null ? clusters : undefined}
                    selectedJobId={selectedJobId}
                    sort={sort}
                    onSortChange={setSort}
                    onSelectJob={(job) => setSelectedJobId(job.id)}
                    emptyMessage={
                      scopedJobs.length === 0
                        ? selectedClusterId === null
                          ? '아직 등록된 배치 잡이 없습니다. ＋ 새 잡 으로 시작하세요.'
                          : '이 클러스터에 등록된 잡이 없습니다.'
                        : '필터에 일치하는 잡이 없습니다. 필터를 해제해 보세요.'
                    }
                  />
                  {selectedClusterId !== null && (
                    <UnregisteredTypeChips
                      clusterJobs={scopedJobs}
                      allTypes={types}
                      onPick={openCreateFromMissingType}
                    />
                  )}
                </div>
              )}
            </MacCard>
          </div>

          {/* 슬라이드오버 — dock 또는 overlay */}
          {selectedJob && !overlayMode && (
            <BatchJobSlideOver
              job={selectedJob}
              onClose={() => setSelectedJobId(null)}
              onDelete={setConfirmDelete}
            />
          )}
        </div>
      </main>

      {/* Overlay 모드 슬라이드오버 — 좁은 뷰포트 */}
      {selectedJob && overlayMode && (
        <BatchJobSlideOver
          job={selectedJob}
          onClose={() => setSelectedJobId(null)}
          onDelete={setConfirmDelete}
          overlayMode
        />
      )}

      {/* Wizard */}
      {wizardCtx && (
        <CreateBatchJobWizard
          open
          defaultClusterId={wizardCtx.clusterId}
          defaultJobType={wizardCtx.jobType}
          onClose={() => setWizardCtx(null)}
          onCreated={(job) => setSelectedJobId(job.id)}
        />
      )}

      {/* 삭제 확인 */}
      {confirmDelete && (
        <ConfirmDialog
          open
          title="배치 잡 삭제"
          description={`"${confirmDelete.name}" 잡과 모든 실행 이력을 삭제합니다. 계속할까요?`}
          confirmLabel="삭제"
          danger
          onConfirm={async () => {
            await del.mutateAsync(confirmDelete.id);
            if (selectedJobId === confirmDelete.id) setSelectedJobId(null);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
