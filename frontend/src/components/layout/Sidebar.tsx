import { useMemo, useState, type ComponentType } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList, ListTodo, CalendarCheck2,
  Settings, Link2, Tags, Calculator, Server, GitFork, BookMarked, Layers,
  Pencil, Moon, Sun, Monitor, Map, BarChart3, Network,
  ChevronDown, ChevronRight, Zap, Route,
} from 'lucide-react';
import { useUiSettings, useUpdateUiSettings } from '@/hooks/useUiSettings';
import { useThemeStore, type Theme } from '@/stores/themeStore';
import { InlineEdit } from '@/components/common';

// ── Nav registry ──────────────────────────────────────────────────────────────
const NAV_MAP: Record<string, { defaultLabel: string; icon: ComponentType<{ className?: string }> }> = {
  '/':                   { defaultLabel: 'Dashboard',      icon: LayoutDashboard },
  '/playbooks':          { defaultLabel: 'Playbooks',      icon: BookOpen },
  '/issues':             { defaultLabel: '이슈 게시판',    icon: ClipboardList },
  '/tasks':              { defaultLabel: '작업 게시판',    icon: ListTodo },
  '/todo-today':         { defaultLabel: '오늘 할일',      icon: CalendarCheck2 },
  '/cluster-manage':     { defaultLabel: '클러스터 관리',  icon: Server },
  '/infra-topology':     { defaultLabel: '인프라 토폴로지', icon: Network },
  '/links':              { defaultLabel: '클러스터 링크',  icon: Link2 },
  '/node-labels':        { defaultLabel: '노드 라벨',      icon: Tags },
  '/cidr':               { defaultLabel: 'CIDR 계산기',    icon: Calculator },
  '/incident-analysis':  { defaultLabel: '장애 로그 분석', icon: Zap },
  '/packet-flow':        { defaultLabel: '패킷 흐름 분석', icon: Route },
  '/work-guides':        { defaultLabel: '작업 가이드',    icon: BookMarked },
  '/ops-notes':          { defaultLabel: '업무 게시판',    icon: Layers },
  '/wbs':                { defaultLabel: 'WBS 작업흐름',   icon: BarChart3 },
  '/mindmap':            { defaultLabel: '마인드맵',       icon: Map },
  '/workflow':           { defaultLabel: '워크플로우',     icon: GitFork },
  '/settings':           { defaultLabel: 'Settings',       icon: Settings },
};

const NAV_GROUPS: Array<{ id: string; label: string; paths: string[] }> = [
  { id: 'monitoring', label: '모니터링',  paths: ['/', '/playbooks'] },
  { id: 'work',       label: '작업관리', paths: ['/issues', '/tasks', '/todo-today'] },
  { id: 'cluster',    label: '클러스터', paths: ['/cluster-manage', '/infra-topology', '/links', '/node-labels', '/cidr'] },
  { id: 'analysis',   label: 'AI 분석',  paths: ['/incident-analysis', '/packet-flow'] },
  { id: 'docs',       label: '운영/문서', paths: ['/work-guides', '/ops-notes', '/wbs', '/mindmap', '/workflow'] },
  { id: 'system',     label: '시스템',   paths: ['/settings'] },
];

const DEFAULT_TITLE = 'K8s Daily Monitor';
const THEME_CYCLE: Record<Theme, Theme> = { dark: 'light', light: 'system', system: 'dark' };
const THEME_LABEL: Record<Theme, string> = { dark: '다크', light: '라이트', system: '시스템' };
const COLLAPSE_KEY = 'k8s:sidebar-collapsed';

export function Sidebar() {
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const { data: settings } = useUiSettings();
  const updateSettings = useUpdateUiSettings();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingNavPath, setEditingNavPath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(COLLAPSE_KEY);
      return s ? new Set(JSON.parse(s)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const title = settings?.appTitle || DEFAULT_TITLE;
  const navLabels = useMemo(() => settings?.navLabels || {}, [settings?.navLabels]);
  const getLabel = (path: string) => navLabels[path] || NAV_MAP[path]?.defaultLabel || path;

  const toggleGroup = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

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
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-card border-r border-border flex flex-col z-40">
      {/* 타이틀 */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-0.5">
            ☸
          </div>
          {isEditingTitle ? (
            <InlineEdit
              value={title}
              onSave={handleTitleSave}
              onCancel={() => setIsEditingTitle(false)}
              className="flex-1 min-w-0 pt-0.5"
              inputClassName="text-sm font-semibold w-full px-1.5 py-0.5 bg-secondary border border-primary rounded"
            />
          ) : (
            <div className="flex-1 min-w-0 group flex items-start gap-1">
              <span className="font-semibold text-sm leading-tight break-words flex-1">{title}</span>
              <button
                onClick={() => setIsEditingTitle(true)}
                className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity flex-shrink-0 mt-0.5"
                title="제목 수정"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 네비게이션 그룹 */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {NAV_GROUPS.map(({ id, label, paths }) => {
          const isCollapsed = collapsed.has(id);
          const hasActive = paths.some(p => location.pathname === p);

          return (
            <div key={id} className="mb-2">
              <button
                onClick={() => toggleGroup(id)}
                className="w-full flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground rounded transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                <span className="flex-1 text-left">{label}</span>
                {isCollapsed && hasActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {paths.map(path => {
                    const navItem = NAV_MAP[path];
                    if (!navItem) return null;
                    const { icon: Icon } = navItem;
                    const isActive = location.pathname === path;
                    const itemLabel = getLabel(path);
                    const isEditing = editingNavPath === path;

                    if (isEditing) {
                      return (
                        <div key={path} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-primary/30">
                          <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                          <InlineEdit
                            value={itemLabel}
                            onSave={(val) => handleNavSave(path, val)}
                            onCancel={() => setEditingNavPath(null)}
                            className="flex-1 min-w-0"
                            inputClassName="text-sm font-medium"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={path} className="group relative">
                        <Link
                          to={path}
                          className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1 min-w-0 truncate">{itemLabel}</span>
                        </Link>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditingNavPath(path); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity rounded"
                          title="메뉴 이름 수정"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
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
      <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">K8s Daily Monitor</p>
        <button
          onClick={() => setTheme(THEME_CYCLE[theme])}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title={`테마: ${THEME_LABEL[theme]} (클릭하여 변경)`}
        >
          {theme === 'dark'   && <Moon className="w-3.5 h-3.5" />}
          {theme === 'light'  && <Sun  className="w-3.5 h-3.5" />}
          {theme === 'system' && <Monitor className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
