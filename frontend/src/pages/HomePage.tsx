import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sun, ClipboardList, AlertCircle, CalendarClock, CheckCircle2,
  AlertTriangle, XCircle, WifiOff, ArrowRight, Sparkles, Server,
  CalendarDays,
} from 'lucide-react';
import { MacCard } from '@/components/ui/MacCard';
import { ClusterSidebar } from '@/components/common';
import { MemberTodayTodos } from '@/components/dashboard/MemberTodayTodos';
import { WorkCalendar } from '@/components/dashboard/WorkCalendar';
import { YesterdayChanges } from '@/components/dashboard/YesterdayChanges';
import { useAuthStore } from '@/stores/authStore';
import { useClusterStore } from '@/stores/clusterStore';
import { useClusters } from '@/hooks/useCluster';
import { useWorkItems } from '@/hooks/useWorkItems';
import { stripHtml } from '@/lib/utils';
import type { Cluster, WorkItem } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greeting(hour: number): string {
  if (hour < 6)  return '늦은 시간 수고 많으세요';
  if (hour < 12) return '좋은 아침입니다';
  if (hour < 18) return '오후 운영 잘 부탁드립니다';
  return '오늘도 마무리 잘 부탁드립니다';
}

function fmtKoreanDate(d: Date): string {
  const week = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${week[d.getDay()]})`;
}

// ── KPI Cell ─────────────────────────────────────────────────────────────────
interface KpiCellProps {
  label: string;
  value: number | string;
  hint?: string;
  Icon: typeof ClipboardList;
  accent: string;
  to?: string;
}

function KpiCell({ label, value, hint, Icon, accent, to }: KpiCellProps) {
  const body = (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 flex items-center gap-3 h-full transition-colors hover:border-primary/40">
      <div className={`w-10 h-10 rounded-xl bg-secondary flex items-center justify-center ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-bold leading-tight tabular-nums">
          {value}
          {hint && <span className="ml-1 text-xs font-medium text-muted-foreground">{hint}</span>}
        </p>
      </div>
      {to && <ArrowRight className="w-4 h-4 text-muted-foreground/40" />}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

// ── Cluster status dot ───────────────────────────────────────────────────────
function StatusDot({ status }: { status: Cluster['status'] }) {
  const cfg = {
    healthy:  { bg: 'bg-emerald-500', Icon: CheckCircle2,  text: 'text-emerald-500' },
    warning:  { bg: 'bg-amber-500',   Icon: AlertTriangle, text: 'text-amber-500' },
    critical: { bg: 'bg-red-500',     Icon: XCircle,       text: 'text-red-500' },
    pending:  { bg: 'bg-slate-400',   Icon: WifiOff,       text: 'text-slate-500' },
  }[status] ?? { bg: 'bg-slate-400', Icon: WifiOff, text: 'text-slate-500' };
  const { Icon } = cfg;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cfg.bg}`} aria-hidden />
      <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
    </span>
  );
}

// ── 일 배치 점검 카드 ────────────────────────────────────────────────────────
interface BatchCheckCardProps {
  clusters: Cluster[];
  selectedClusterId: string | null;
}

function BatchCheckCard({ clusters, selectedClusterId }: BatchCheckCardProps) {
  const filtered = selectedClusterId ? clusters.filter((c) => c.id === selectedClusterId) : clusters;

  return (
    <MacCard title="일 배치 점검 (오늘)" bodyPadding="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>09 / 13 / 18시 자동 점검 — 클러스터별 최신 상태</span>
        </div>
        <Link
          to="/cluster-overview"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          전체 점검 보기 <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          등록된 클러스터가 없습니다.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/daily-check/review/${c.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-secondary transition-colors min-w-0"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Server className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                {c.region && <p className="text-[11px] text-muted-foreground truncate">{c.region}</p>}
              </div>
              <StatusDot status={c.status} />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </MacCard>
  );
}

// ── 미해결 이슈 카드 ─────────────────────────────────────────────────────────
interface OpenIssuesCardProps {
  items: WorkItem[];
  isLoading: boolean;
  selectedClusterId: string | null;
  myName: string | null;
}

function OpenIssuesCard({ items, isLoading, selectedClusterId, myName }: OpenIssuesCardProps) {
  const [onlyMine, setOnlyMine] = useState(false);

  const list = useMemo(() => {
    let l = items.filter((i) => !i.closedAt);
    if (selectedClusterId) l = l.filter((i) => i.clusterId === selectedClusterId);
    if (onlyMine && myName) {
      l = l.filter((i) => i.primaryAssignee === myName || i.assignee === myName || i.secondaryAssignee === myName);
    }
    return l.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6);
  }, [items, selectedClusterId, onlyMine, myName]);

  return (
    <MacCard title="해결해야 할 이슈" bodyPadding="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>미해결 · {list.length}건</span>
        </div>
        <div className="flex items-center gap-2">
          {myName && (
            <label className="inline-flex items-center gap-1 text-[11px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => setOnlyMine(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              <span className="text-muted-foreground">내 이슈만</span>
            </label>
          )}
          <Link to="/items" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            전체 보기 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          {onlyMine ? '내 미해결 이슈가 없습니다.' : '현재 미해결 이슈가 없습니다.'}
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {list.map((i) => (
            <li key={i.id}>
              <Link
                to={`/tasks-mgmt/${i.id}`}
                className="block px-3 py-2 rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-secondary transition-colors min-w-0"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {stripHtml(i.content) || i.category}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">{i.category}</span>
                      <span>정: {i.primaryAssignee || i.assignee}</span>
                      {i.clusterName && <span>· {i.clusterName}</span>}
                      <span className="ml-auto tabular-nums">{i.startedAt}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MacCard>
  );
}

// ── 다음 일정 (WorkItem.startedAt 가장 가까운 미완료) ─────────────────────────────
function nextDueTask(items: WorkItem[]): WorkItem | null {
  const now = Date.now();
  const candidates = items
    .filter((t) => t.startedAt && t.kanbanStatus !== 'done')
    .map((t) => ({ t, ms: new Date(t.startedAt as string).getTime() }))
    .filter(({ ms }) => Number.isFinite(ms) && ms >= now - 1000 * 60 * 60 * 24)
    .sort((a, b) => a.ms - b.ms);
  return candidates[0]?.t ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function HomePage() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const myName = user?.displayName?.trim() || user?.username || null;

  const { clusters } = useClusterStore();
  const { isLoading: clustersLoading } = useClusters();

  const { data: workItemsData, isLoading: workItemsLoading } = useWorkItems();
  const allWorkItems = useMemo<WorkItem[]>(() => workItemsData?.data ?? [], [workItemsData]);
  const allTasks  = useMemo<WorkItem[]>(() => allWorkItems.filter((w) => w.type === 'task'), [allWorkItems]);
  const allIssues = useMemo<WorkItem[]>(() => allWorkItems.filter((w) => w.type === 'issue'), [allWorkItems]);
  const tasksLoading = workItemsLoading;
  const issuesLoading = workItemsLoading;

  // ── KPI 계산 ──
  const today = todayKey();
  const myTodayTasks = useMemo(() => {
    if (!myName) return [];
    return allTasks.filter((t) => {
      if (t.kanbanStatus === 'done') return false;
      const match =
        t.assignee === myName ||
        t.primaryAssignee === myName ||
        t.secondaryAssignee === myName;
      if (!match) return false;
      const due = t.startedAt?.slice(0, 10);
      return !due || due <= today;
    });
  }, [allTasks, myName, today]);

  const openIssueCount = useMemo(() => allIssues.filter((i) => !i.closedAt).length, [allIssues]);
  const criticalClusters = useMemo(() => clusters.filter((c) => c.status === 'critical').length, [clusters]);
  const upcomingTask = useMemo(() => nextDueTask(allTasks), [allTasks]);
  const upcomingLabel = upcomingTask?.startedAt
    ? new Date(upcomingTask.startedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '없음';

  // ── 인사말 ──
  const now = new Date();
  const hour = now.getHours();
  const hello = greeting(hour);
  const dateStr = fmtKoreanDate(now);

  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 lg:px-4 xl:px-6 py-3 flex gap-3">
        <ClusterSidebar
          clusters={clusters}
          selectedId={selectedClusterId}
          onSelect={setSelectedClusterId}
          allowAll
          allLabel="전체 현황"
          iconOnly
        />

        <main className="flex-1 min-w-0 space-y-3">
          {/* ── 인사 헤더 ──────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Sun className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">
                  {hello}{myName ? `, ${myName}님` : ''}
                </h1>
                <p className="text-xs text-muted-foreground tabular-nums">{dateStr}</p>
              </div>
            </div>
          </div>

          {/* ── KPI strip ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCell
              label="내 오늘 할일"
              value={myName ? myTodayTasks.length : '—'}
              hint={myName ? '건' : undefined}
              Icon={ClipboardList}
              accent="text-primary"
              to="/todo-today"
            />
            <KpiCell
              label="미해결 이슈"
              value={openIssueCount}
              hint="건"
              Icon={AlertCircle}
              accent="text-red-500"
              to="/items"
            />
            <KpiCell
              label="위험 클러스터"
              value={clustersLoading ? '…' : criticalClusters}
              hint={clustersLoading ? '' : `/ ${clusters.length}`}
              Icon={Server}
              accent="text-amber-500"
              to="/cluster-overview"
            />
            <KpiCell
              label="다음 일정"
              value={upcomingLabel}
              Icon={CalendarClock}
              accent="text-sky-500"
              to="/items"
            />
          </div>

          {/* ── 메인 2-col (3:7 — 달력에 더 많은 가로 폭) ─────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-10 gap-3">
            {/* 담당자별 진행 현황 — 좌측 3/10 */}
            <MacCard title="DevOps 담당자별 진행 현황" bodyPadding="p-4" rootClassName="xl:col-span-3">
              <MemberTodayTodos selectedClusterId={selectedClusterId} />
            </MacCard>

            {/* 캘린더 — 우측 7/10 (날짜 셀 너비 확보) */}
            <MacCard title="이번 달 일정 (WorkItem 마감일)" bodyPadding="p-4" rootClassName="xl:col-span-7">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span>WorkItem 의 예정일 · 이슈 발생일 마크</span>
              </div>
              <WorkCalendar selectedClusterId={selectedClusterId} />
            </MacCard>

            {/* 일 배치 점검 */}
            <BatchCheckCard clusters={clusters} selectedClusterId={selectedClusterId} />

            {/* 미해결 이슈 */}
            <OpenIssuesCard
              items={allIssues}
              isLoading={issuesLoading || tasksLoading}
              selectedClusterId={selectedClusterId}
              myName={myName}
            />
          </div>

          {/* ── 어제 변경 사항 (요약) ─────────────────────────────── */}
          <MacCard title="어제 변경 사항" bodyPadding="p-4">
            <YesterdayChanges selectedClusterId={selectedClusterId} />
          </MacCard>
        </main>
      </div>
    </div>
  );
}
