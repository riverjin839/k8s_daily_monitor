import { useMemo, useState, type ComponentType } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList, ListTodo, CalendarCheck2,
  Settings, Link2, Tags, Calculator, Server, GitFork, BookMarked, Layers, Boxes,
  Pencil, Moon, Sun, Monitor, Map, BarChart3, Network,
  Zap, Route, Share2, Rss, Users, GitCommit, Terminal, Database, Cpu, HardDrive,
  PanelLeftOpen, X, ClipboardCheck, ListTree, ChevronRight, LogOut,
} from 'lucide-react';
import { useUiSettings, useUpdateUiSettings } from '@/hooks/useUiSettings';
import { useServiceCatalog } from '@/hooks/useServiceCatalog';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { useSidebarStore, NAV_WIDTH } from '@/stores/sidebarStore';
import { useAuthStore } from '@/stores/authStore';
import { InlineEdit } from '@/components/common';

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
  '/node-images':        { defaultLabel: '노드 이미지',    icon: Boxes },
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
  { id: 'cluster',    label: '클러스터',   paths: ['/cluster-manage', '/node-specs', '/versions', '/bulk-exec', '/etcdctl', '/batch-jobs', '/mc', '/kernel-params', '/infra-topology', '/links', '/node-labels', '/node-images', '/cidr'] },
  { id: 'analysis',   label: 'AI 분석',    paths: ['/incident-analysis', '/packet-flow', '/ontology', '/trends'] },
  { id: 'docs',       label: '지식 허브',   paths: ['/services', '/work-guides', '/ops-notes', '/issues', '/tasks', '/incident-analysis', '/wbs', '/mindmap', '/workflow'] },
  { id: 'system',     label: '시스템',     paths: ['/settings'] },
];

const DOCS_TASK_SECTIONS: Array<{ id: string; label: string; icon: ComponentType<{ className?: string }>; paths: string[] }> = [
  { id: 'ops', label: '운영 기준', icon: Layers, paths: ['/services', '/ops-notes'] },
  { id: 'work', label: '작업 기준', icon: BookMarked, paths: ['/work-guides', '/tasks'] },
  { id: 'issue', label: '이슈/장애', icon: Zap, paths: ['/issues', '/incident-analysis'] },
  { id: 'flow', label: '흐름/설계', icon: GitFork, paths: ['/workflow', '/wbs', '/mindmap'] },
];

const DEFAULT_TITLE = 'DEVOPS MANAGEMENT';
const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const THEME_LABEL: Record<Theme, string> = { dark: '다크', light: '라이트', system: '시스템' };

// ── 개별 nav item ───────────────────────────────────────────────────────────

// Shared visual shell so Link-based NavItems and button-based action items
// render identically — no font / padding drift between them.
// `whitespace-normal break-keep leading-tight` lets long Korean labels wrap
// onto a second line instead of being truncated when the sidebar is narrow.
// Font size matches main-content text-sm (14px) for cross-region consistency.
const NAV_ITEM_BASE = 'relative flex items-start gap-1.5 px-2 py-1.5 rounded-md text-sm leading-tight transition-colors';
const NAV_ITEM_INACTIVE = 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground';
const NAV_ITEM_ACTIVE = 'bg-secondary text-foreground font-semibold';

function NavItem({
  path, label, Icon, isActive,
}: {
  path: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  isActive: boolean;
}) {
  return (
    <Link
      to={path}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 -translate-x-[3px] w-1 h-4 bg-primary rounded-r"
        />
      )}
      <Icon className="w-4 h-4 flex-shrink-0 mt-px" />
      <span className="flex-1 min-w-0 break-keep whitespace-normal">{label}</span>
    </Link>
  );
}

function NavActionItem({
  label, Icon, active, onClick,
}: {
  label: string;
  Icon: ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${NAV_ITEM_BASE} w-full text-left ${active ? NAV_ITEM_ACTIVE : NAV_ITEM_INACTIVE}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-px" />
      <span className="flex-1 min-w-0 break-keep whitespace-normal">{label}</span>
    </button>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const { data: settings } = useUiSettings();
  const updateSettings = useUpdateUiSettings();

  const collapsedGroups = useSidebarStore((s) => s.collapsedGroups);
  const toggleGroup = useSidebarStore((s) => s.toggleGroup);

  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.clear);

  const [editMode, setEditMode] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingNavPath, setEditingNavPath] = useState<string | null>(null);

  const title = settings?.appTitle || DEFAULT_TITLE;
  const navLabels = useMemo(() => settings?.navLabels || {}, [settings?.navLabels]);
  const services = useServiceCatalog();

  // 동적 NAV_MAP — 정적 NAV_MAP 위에 ui_settings 의 서비스 항목을 덧씌움.
  const navMap = useMemo(() => {
    const m: typeof NAV_MAP = { ...NAV_MAP };
    for (const s of services) {
      if (s.key === 'other') continue;
      m[`/services/${s.key}`] = { defaultLabel: s.label, icon: s.icon };
    }
    return m;
  }, [services]);

  const servicePaths = useMemo(
    () => services.filter((s) => s.key !== 'other').map((s) => `/services/${s.key}`),
    [services],
  );

  const navGroups = useMemo(
    () => NAV_GROUPS.map((g) => (g.id === 'docs' ? { ...g, paths: [...servicePaths, ...g.paths] } : g)),
    [servicePaths],
  );

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

  return (
    <>
      <aside
        style={{
          width: NAV_WIDTH,
          // Sidebar overrides global tokens within this aside only — child
          // components keep using bg-card / text-muted-foreground / etc.
          // and automatically pick up the dark-navy palette.
          ['--card' as string]: 'var(--sidebar)',
          ['--card-foreground' as string]: 'var(--sidebar-foreground)',
          ['--foreground' as string]: 'var(--sidebar-foreground)',
          ['--muted-foreground' as string]: 'var(--sidebar-muted-foreground)',
          ['--secondary' as string]: 'var(--sidebar-accent)',
          ['--secondary-foreground' as string]: 'var(--sidebar-accent-foreground)',
          ['--border' as string]: 'var(--sidebar-border)',
          ['--background' as string]: 'var(--sidebar)',
          ['--primary' as string]: 'var(--sidebar-primary)',
        } as React.CSSProperties}
        className="fixed top-0 left-0 h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col z-40"
      >
        {/* 타이틀 */}
        <div className="flex items-center gap-2 px-2.5 py-3 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-sky-700 rounded-md flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
            ☸
          </div>
          <span className="font-bold text-sm leading-tight text-foreground flex-1 min-w-0 break-keep" title={title}>
            {title}
          </span>
        </div>

        {/* 네비 */}
        <nav className="flex-1 py-1.5 overflow-y-auto" aria-label="메인 네비게이션">
          {navGroups.map(({ id, label, paths }, groupIdx) => {
            const validPaths = paths.filter((p) => navMap[p]);
            if (validPaths.length === 0) return null;
            const containsActive = validPaths.includes(location.pathname)
              || (id === 'docs' && location.pathname.startsWith('/services/'));
            const isCollapsed = collapsedGroups[id] ?? true;
            const isSystem = id === 'system';
            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(id)}
                  className={`${groupIdx > 0 ? 'mt-0.5' : ''} w-full flex items-center gap-1 px-2 py-1.5 text-[13px] font-semibold transition-colors ${
                    containsActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-expanded={!isCollapsed}
                >
                  <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                  <span className="flex-1 text-left truncate">{label}</span>
                  {containsActive && (
                    <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground/60 font-medium flex-shrink-0">{validPaths.length}</span>
                </button>
                {!isCollapsed && id !== 'docs' && (
                  <div className="flex flex-col px-1.5 pb-0.5">
                    {validPaths.map((path) => (
                      <NavItem key={path} path={path} label={getLabel(path)} Icon={navMap[path].icon} isActive={location.pathname === path} />
                    ))}
                    {isSystem && (
                      <NavActionItem
                        label="메뉴 이름 편집"
                        Icon={PanelLeftOpen}
                        active={editMode}
                        onClick={() => setEditMode((v) => !v)}
                      />
                    )}
                  </div>
                )}
                {!isCollapsed && id === 'docs' && (
                  <div className="flex flex-col gap-1.5 px-1.5 pb-0.5">
                    {docsSections.map((section) => {
                      const sectionActive = section.paths.includes(location.pathname);
                      const SIcon = section.icon;
                      return (
                        <div key={section.id} className={`rounded-md border ${sectionActive ? 'border-primary/35 bg-primary/8' : 'border-border/50 bg-background/40'} p-1.5`}>
                          <div className="flex items-center gap-1.5 px-1 pb-1">
                            <SIcon className={`w-3.5 h-3.5 ${sectionActive ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="text-[11px] font-semibold text-muted-foreground">{section.label}</span>
                          </div>
                          <div className="flex flex-col">
                            {section.paths.map((path) => {
                              const entry = navMap[path];
                              if (!entry) return null;
                              return (
                                <NavItem key={path} path={path} label={getLabel(path)} Icon={entry.icon} isActive={location.pathname === path} />
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

        {/* 푸터 — 사용자 / 테마 / 로그아웃 */}
        <div className="flex-shrink-0 border-t border-border py-1.5 px-1.5 space-y-0.5">
          {currentUser && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground/80 leading-tight break-keep">
              <div className="font-semibold text-foreground/90 truncate" title={currentUser.username}>
                {currentUser.displayName || currentUser.username}
              </div>
              <div className="opacity-70">
                {currentUser.role === 'admin' ? 'Administrator' : currentUser.username}
              </div>
            </div>
          )}
          <NavActionItem
            label={`테마: ${THEME_LABEL[theme]}`}
            Icon={theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor}
            onClick={() => setTheme(THEME_CYCLE[theme])}
          />
          {currentUser && (
            <NavActionItem
              label="로그아웃"
              Icon={LogOut}
              onClick={logout}
            />
          )}
        </div>
      </aside>

      {/* ── 편집 오버레이 패널 ───────────────────────────────────────────── */}
      {editMode && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setEditMode(false)}
            aria-hidden="true"
          />
          <aside
            style={{ left: NAV_WIDTH }}
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
              <p className="text-xs text-muted-foreground/70 mb-1 uppercase tracking-wider">앱 타이틀</p>
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
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</p>
                  <div className="space-y-0.5">
                    {paths.map((path) => {
                      const navItem = navMap[path];
                      if (!navItem) return null;
                      const { icon: Icon } = navItem;
                      const itemLabel = getLabel(path);
                      const isEditing = editingNavPath === path;
                      if (isEditing) {
                        return (
                          <div key={path} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/50 border border-primary/30">
                            <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                            <InlineEdit value={itemLabel} onSave={(v) => handleNavSave(path, v)} onCancel={() => setEditingNavPath(null)}
                              className="flex-1 min-w-0" inputClassName="text-sm" />
                          </div>
                        );
                      }
                      return (
                        <button key={path} onClick={() => setEditingNavPath(path)}
                          className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary text-left text-sm">
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
            <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground">
              외부 클릭으로 닫기. 이름만 수정됩니다.
            </div>
          </aside>
        </>
      )}
    </>
  );
}
