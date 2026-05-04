import { useMemo, useState, useRef, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList, ListTodo, CalendarCheck2,
  Settings, Link2, Tags, Calculator, Server, GitFork, BookMarked, Layers,
  Pencil, Moon, Sun, Monitor, Map, BarChart3, Network,
  Zap, Route, Share2, Rss, Users, GitCommit, Terminal, Database, Cpu, HardDrive,
  PanelLeftOpen, X, ClipboardCheck, ListTree, ChevronRight,
} from 'lucide-react';
import { useUiSettings, useUpdateUiSettings } from '@/hooks/useUiSettings';
import { useServiceCatalog } from '@/hooks/useServiceCatalog';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { useSidebarStore, NAV_COLLAPSE_AT } from '@/stores/sidebarStore';
import { InlineEdit, ResizeHandle } from '@/components/common';
import { SERVICE_CATALOG } from '@/components/services/serviceCatalog';

// ── Nav registry ──────────────────────────────────────────────────────────────
const NAV_MAP: Record<string, { defaultLabel: string; icon: ComponentType<{ className?: string }> }> = {
  '/':                   { defaultLabel: 'Dashboard',      icon: LayoutDashboard },
  '/playbooks':          { defaultLabel: 'Playbooks',      icon: BookOpen },
  '/issues':             { defaultLabel: '이슈 게시판',    icon: ClipboardList },
  '/tasks':              { defaultLabel: '작업 게시판',    icon: ListTodo },
  '/todo-today':         { defaultLabel: '오늘 할일',      icon: CalendarCheck2 },
  '/members':            { defaultLabel: '멤버별 업무',    icon: Users },
  '/cluster-manage':     { defaultLabel: '클러스터 관리',  icon: Server },
  '/versions':           { defaultLabel: '버전 / 설정',     icon: GitCommit },
  '/bulk-exec':          { defaultLabel: '노드 일괄 실행', icon: Terminal },
  '/etcdctl':            { defaultLabel: 'etcdctl 콘솔',   icon: Database },
  '/batch-jobs':         { defaultLabel: 'Batch Jobs',     icon: ListTree },
  '/mc':                 { defaultLabel: 'mc 클라이언트',  icon: HardDrive },
  '/kernel-params':      { defaultLabel: '커널 파라미터',  icon: Cpu },
  '/infra-topology':     { defaultLabel: '인프라 토폴로지', icon: Network },
  '/node-specs':         { defaultLabel: '노드 서버스펙',  icon: ClipboardCheck },
  '/links':              { defaultLabel: '클러스터 링크',  icon: Link2 },
  '/node-labels':        { defaultLabel: '노드 라벨',      icon: Tags },
  '/cidr':               { defaultLabel: 'CIDR 계산기',    icon: Calculator },
  '/incident-analysis':  { defaultLabel: '장애 로그 분석', icon: Zap },
  '/packet-flow':        { defaultLabel: '패킷 흐름 분석', icon: Route },
  '/ontology':           { defaultLabel: '온톨로지 그래프', icon: Share2 },
  '/trends':             { defaultLabel: '기술 동향',      icon: Rss },
  '/services':           { defaultLabel: '통합 지식/SOP',  icon: BookOpen },
  '/work-guides':        { defaultLabel: '표준 작업 가이드', icon: BookMarked },
  '/ops-notes':          { defaultLabel: '운영 노트보드',   icon: Layers },
  '/wbs':                { defaultLabel: 'WBS 작업흐름',   icon: BarChart3 },
  '/mindmap':            { defaultLabel: '마인드맵',       icon: Map },
  '/workflow':           { defaultLabel: '워크플로우',     icon: GitFork },
  '/settings':           { defaultLabel: 'Settings',       icon: Settings },
};

const NAV_GROUPS: Array<{ id: string; label: string; paths: string[] }> = [
  { id: 'monitoring', label: '모니터링',   paths: ['/', '/playbooks'] },
  { id: 'work',       label: '작업관리',   paths: ['/issues', '/tasks', '/todo-today', '/members'] },
  { id: 'cluster',    label: '클러스터',   paths: ['/cluster-manage', '/node-specs', '/versions', '/bulk-exec', '/etcdctl', '/batch-jobs', '/mc', '/kernel-params', '/infra-topology', '/links', '/node-labels', '/cidr'] },
  { id: 'analysis',   label: 'AI 분석',    paths: ['/incident-analysis', '/packet-flow', '/ontology', '/trends'] },
  // 지식 허브 — 그룹 클릭 시 펼치면 ① 서비스 카탈로그(ui_settings 의 서비스들이 동적으로 추가됨)
  // ② 작업가이드/이슈/업무게시판/WBS/마인드맵/워크플로우 가 모두 sub-item 으로 노출.
  { id: 'docs',       label: '지식 허브',   paths: ['/services', '/work-guides', '/ops-notes', '/issues', '/tasks', '/incident-analysis', '/wbs', '/mindmap', '/workflow'] },
  { id: 'system',     label: '시스템',     paths: ['/settings'] },
];


const DOCS_TASK_SECTIONS: Array<{ id: string; label: string; icon: ComponentType<{ className?: string }>; paths: string[] }> = [
  { id: 'ops', label: '운영 기준', icon: Layers, paths: ['/services', '/ops-notes'] },
  { id: 'work', label: '작업 기준', icon: BookMarked, paths: ['/work-guides', '/tasks'] },
  { id: 'issue', label: '이슈/장애', icon: Zap, paths: ['/issues', '/incident-analysis'] },
  { id: 'flow', label: '흐름/설계', icon: GitFork, paths: ['/workflow', '/wbs', '/mindmap'] },
];

// 동적 서비스 카탈로그 — 각 서비스마다 /services/<key> 라우트를 nav 에 등록.
// 'other' 폴백은 사이드바 항목으로 노출하지 않는다.
const SERVICE_NAV_ENTRIES = SERVICE_CATALOG.filter((s) => s.key !== 'other');
const SERVICE_NAV_PATHS = SERVICE_NAV_ENTRIES.map((s) => `/services/${s.key}`);

const DEFAULT_TITLE = 'K8s Daily Monitor';
const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const THEME_LABEL: Record<Theme, string> = { dark: '다크', light: '라이트', system: '시스템' };

// ── Portal tooltip (scroll container overflow 무시) ────────────────────────

interface PortalTooltipState {
  label: string;
  x: number;   // viewport X (아이콘 오른쪽 끝)
  y: number;   // viewport Y (아이콘 중앙)
}

function PortalTooltip({ state }: { state: PortalTooltipState | null }) {
  if (!state) return null;
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: state.x + 10,
        top: state.y,
        transform: 'translateY(-50%)',
        zIndex: 9999,
      }}
      className="pointer-events-none px-2.5 py-1 bg-card/95 backdrop-blur-lg border border-border rounded-lg shadow-lg text-xs font-medium text-foreground whitespace-nowrap"
    >
      {state.label}
    </div>,
    document.body,
  );
}

// ── 개별 nav item ───────────────────────────────────────────────────────────

function NavItem({
  path, label, Icon, isActive, showLabel, onHover, onLeave,
}: {
  path: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  isActive: boolean;
  showLabel: boolean;
  onHover: (e: React.MouseEvent, label: string) => void;
  onLeave: () => void;
}) {
  return (
    <Link
      to={path}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onMouseEnter={(e) => onHover(e, label)}
      onMouseLeave={onLeave}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
        isActive
          ? 'bg-primary/12 text-primary font-semibold shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.14)]'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1 h-5 bg-primary rounded-r"
        />
      )}
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {showLabel && <span className="flex-1 min-w-0 truncate text-sm">{label}</span>}
    </Link>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const { data: settings } = useUiSettings();
  const updateSettings = useUpdateUiSettings();

  const navWidth = useSidebarStore((s) => s.navWidth);
  const setNavWidth = useSidebarStore((s) => s.setNavWidth);
  const resetNav = useSidebarStore((s) => s.resetNav);
  const collapsedGroups = useSidebarStore((s) => s.collapsedGroups);
  const toggleGroup = useSidebarStore((s) => s.toggleGroup);

  const iconOnly = navWidth < NAV_COLLAPSE_AT;

  const [editMode, setEditMode] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingNavPath, setEditingNavPath] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<PortalTooltipState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const title = settings?.appTitle || DEFAULT_TITLE;
  const navLabels = useMemo(() => settings?.navLabels || {}, [settings?.navLabels]);
  const services = useServiceCatalog();

  // 동적 NAV_MAP — 정적 NAV_MAP 위에 ui_settings 의 서비스 항목을 덧씌움.
  // 서비스마다 /services/<slug> 라우트가 있다고 가정 (App.tsx 의 ServiceHubPage).
  const navMap = useMemo(() => {
    const m: typeof NAV_MAP = { ...NAV_MAP };
    for (const s of services) {
      if (s.key === 'other') continue; // '기타' 폴백은 사이드바 항목으로 노출 안 함
      m[`/services/${s.key}`] = { defaultLabel: s.label, icon: s.icon };
    }
    return m;
  }, [services]);

  // 서비스 카탈로그 → /services/<slug> 경로 목록 (sub-item 으로 사용).
  const servicePaths = useMemo(
    () => services.filter((s) => s.key !== 'other').map((s) => `/services/${s.key}`),
    [services],
  );

  // 동적 NAV_GROUPS — '지식 허브' 그룹의 paths 앞쪽에 서비스 sub-item 들을 붙임.
  const navGroups = useMemo(
    () => NAV_GROUPS.map((g) => (g.id === 'docs' ? { ...g, paths: [...servicePaths, ...g.paths] } : g)),
    [servicePaths],
  );

  // DOCS 내부 섹션에 동적 서비스 섹션을 추가 — 펼치면 서비스 카탈로그가 먼저 보인다.
  const docsSections = useMemo(
    () => [
      { id: 'services', label: '서비스 카탈로그', icon: Server, paths: servicePaths },
      ...DOCS_TASK_SECTIONS,
    ],
    [servicePaths],
  );

  const getLabel = (path: string) => navLabels[path] || navMap[path]?.defaultLabel || path;

  const handleTitleSave = (val: string) => {
    updateSettings.mutate({ appTitle: val || DEFAULT_TITLE, navLabels });
    setIsEditingTitle(false);
  };

  const handleNavSave = (path: string, val: string) => {
    const updated = { ...navLabels, [path]: val };
    if (!val) delete updated[path];
    updateSettings.mutate({ appTitle: title, navLabels: updated });
    setEditingNavPath(null);
  };

  // icon-only 모드일 때만 포털 tooltip (inline label 이 이미 있으면 불필요)
  const onNavHover = (e: React.MouseEvent, label: string) => {
    if (!iconOnly) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimerRef.current = window.setTimeout(() => {
      setTooltip({
        label,
        x: rect.right,
        y: rect.top + rect.height / 2,
      });
    }, 150);
  };
  const onNavLeave = () => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltip(null);
  };

  return (
    <>
      <aside
        style={{ width: navWidth }}
        className="fixed top-0 left-0 h-full bg-card/90 backdrop-blur-2xl border-r border-border flex flex-col z-40"
      >
        {/* 타이틀 */}
        <div className={`flex items-center ${iconOnly ? 'justify-center py-4' : 'gap-2 px-3 py-4'} border-b border-border flex-shrink-0`}>
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-sky-700 rounded-2xl flex items-center justify-center text-white text-lg shadow-[0_10px_22px_rgba(0,122,255,0.28)] flex-shrink-0">
            ☸
          </div>
          {!iconOnly && (
            <span className="font-bold text-sm truncate text-foreground flex-1" title={title}>{title}</span>
          )}
        </div>

        {/* 네비 */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-visible" aria-label="메인 네비게이션">
          {navGroups.map(({ id, label, paths }, groupIdx) => {
            const validPaths = paths.filter((p) => navMap[p]);
            if (validPaths.length === 0) return null;
            // 지식 허브 그룹은 /services/:slug 도 active 로 인식 → 해당 페이지에서 그룹이 자동 펼쳐짐.
            const containsActive = validPaths.includes(location.pathname)
              || (id === 'docs' && location.pathname.startsWith('/services/'));
            const isCollapsed = !iconOnly && !containsActive && (collapsedGroups[id] ?? true);
            return (
              <div key={id}>
                {iconOnly
                  ? (groupIdx > 0 && <div className="mx-3 my-1.5 border-t border-border/40" aria-hidden="true" />)
                  : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(id)}
                      className={`${groupIdx > 0 ? 'mt-3' : ''} w-full flex items-center gap-1 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors`}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                      <span className="flex-1 text-left">{label}</span>
                      <span className="text-[10px] text-muted-foreground/60 font-medium normal-case tracking-normal">{validPaths.length}</span>
                    </button>
                  )}
                {!isCollapsed && id !== 'docs' && (
                  <div className={`flex flex-col gap-0.5 ${iconOnly ? 'px-1.5' : 'px-2'}`}>
                    {validPaths.map((path) => (
                      <NavItem key={path} path={path} label={getLabel(path)} Icon={navMap[path].icon} isActive={location.pathname === path} showLabel={!iconOnly} onHover={onNavHover} onLeave={onNavLeave} />
                    ))}
                  </div>
                )}
                {!isCollapsed && id === 'docs' && (
                  <div className={`flex flex-col gap-2 ${iconOnly ? 'px-1.5' : 'px-2'}`}>
                    {docsSections.map((section) => {
                      const sectionActive = section.paths.includes(location.pathname);
                      const SIcon = section.icon;
                      return (
                        <div key={section.id} className={`rounded-xl border ${sectionActive ? 'border-primary/35 bg-primary/8' : 'border-border/50 bg-background/40'} p-2`}>
                          {!iconOnly && (
                            <div className="flex items-center gap-2 px-1 pb-1.5">
                              <SIcon className={`w-3.5 h-3.5 ${sectionActive ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">{section.label}</span>
                            </div>
                          )}
                          <div className="flex flex-col gap-0.5">
                            {section.paths.map((path) => {
                              const entry = navMap[path];
                              if (!entry) return null;
                              return (
                                <NavItem key={path} path={path} label={getLabel(path)} Icon={entry.icon} isActive={location.pathname === path} showLabel={!iconOnly} onHover={onNavHover} onLeave={onNavLeave} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* 푸터 */}
        <div className={`flex-shrink-0 border-t border-border py-2 ${iconOnly ? 'flex flex-col items-center gap-1' : 'px-2 space-y-1'}`}>
          <button
            onClick={() => setEditMode((v) => !v)}
            onMouseEnter={(e) => onNavHover(e, '메뉴 이름 편집')}
            onMouseLeave={onNavLeave}
            className={`${iconOnly ? 'w-11 h-11 justify-center' : 'w-full gap-3 px-3 py-2'} rounded-lg flex items-center transition-colors ${
              editMode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <PanelLeftOpen className="w-[18px] h-[18px] flex-shrink-0" />
            {!iconOnly && <span className="text-sm">메뉴 이름 편집</span>}
          </button>
          <button
            onClick={() => setTheme(THEME_CYCLE[theme])}
            onMouseEnter={(e) => onNavHover(e, `테마: ${THEME_LABEL[theme]}`)}
            onMouseLeave={onNavLeave}
            className={`${iconOnly ? 'w-11 h-11 justify-center' : 'w-full gap-3 px-3 py-2'} rounded-lg flex items-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors`}
            aria-label="테마 변경"
          >
            {theme === 'dark' && <Moon className="w-[18px] h-[18px] flex-shrink-0" />}
            {theme === 'light' && <Sun className="w-[18px] h-[18px] flex-shrink-0" />}
            {theme === 'system' && <Monitor className="w-[18px] h-[18px] flex-shrink-0" />}
            {!iconOnly && <span className="text-sm">테마: {THEME_LABEL[theme]}</span>}
          </button>
        </div>

        {/* 리사이즈 핸들 */}
        <ResizeHandle width={navWidth} onResize={setNavWidth} onReset={resetNav} />
      </aside>

      {/* Portal tooltip (icon-only 모드 한정) */}
      <PortalTooltip state={iconOnly ? tooltip : null} />

      {/* ── 편집 오버레이 패널 ───────────────────────────────────────────── */}
      {editMode && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setEditMode(false)}
            aria-hidden="true"
          />
          <aside
            style={{ left: navWidth }}
            className="fixed top-0 h-full w-72 bg-card border-r border-border shadow-2xl flex flex-col z-40"
          >
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span className="text-sm font-semibold flex-1">메뉴 편집</span>
              <button onClick={() => setEditMode(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                title="닫기">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] text-muted-foreground/70 mb-1 uppercase tracking-wider">앱 타이틀</p>
              {isEditingTitle ? (
                <InlineEdit value={title} onSave={handleTitleSave} onCancel={() => setIsEditingTitle(false)}
                  inputClassName="text-sm font-semibold w-full px-1.5 py-0.5 bg-secondary border border-primary rounded" />
              ) : (
                <button onClick={() => setIsEditingTitle(true)}
                  className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-secondary text-left">
                  <span className="font-semibold text-sm truncate">{title}</span>
                  <Pencil className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                </button>
              )}
            </div>
            <nav className="flex-1 py-2 px-2 overflow-y-auto">
              {navGroups.map(({ id, label, paths }) => (
                <div key={id} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
                  <div className="space-y-0.5">
                    {paths.map((path) => {
                      const navItem = navMap[path];
                      if (!navItem) return null;
                      const { icon: Icon } = navItem;
                      const itemLabel = getLabel(path);
                      const isEditing = editingNavPath === path;
                      if (isEditing) {
                        return (
                          <div key={path} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-secondary/50 border border-primary/30">
                            <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <InlineEdit value={itemLabel} onSave={(v) => handleNavSave(path, v)} onCancel={() => setEditingNavPath(null)}
                              className="flex-1 min-w-0" inputClassName="text-sm" />
                          </div>
                        );
                      }
                      return (
                        <button key={path} onClick={() => setEditingNavPath(path)}
                          className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary text-left text-sm">
                          <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <span className="flex-1 min-w-0 truncate">{itemLabel}</span>
                          <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
              외부 클릭으로 닫기. 이름만 수정됩니다.
            </div>
          </aside>
        </>
      )}
    </>
  );
}
