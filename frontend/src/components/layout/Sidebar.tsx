import { useMemo, useState, type ComponentType } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, ClipboardList, ListTodo, CalendarCheck2,
  Settings, Link2, Tags, Calculator, Server, GitFork, BookMarked, Layers,
  Pencil, Moon, Sun, Monitor, Map, BarChart3, Network,
  Zap, Route, Share2, Rss, Users, GitCommit, Terminal, Database, Cpu, HardDrive,
  PanelLeftOpen, X,
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
  '/members':            { defaultLabel: '멤버별 업무',    icon: Users },
  '/cluster-manage':     { defaultLabel: '클러스터 관리',  icon: Server },
  '/versions':           { defaultLabel: '버전 / 설정',     icon: GitCommit },
  '/bulk-exec':          { defaultLabel: '노드 일괄 실행', icon: Terminal },
  '/etcdctl':            { defaultLabel: 'etcdctl 콘솔',   icon: Database },
  '/mc':                 { defaultLabel: 'mc 클라이언트',  icon: HardDrive },
  '/kernel-params':      { defaultLabel: '커널 파라미터',  icon: Cpu },
  '/infra-topology':     { defaultLabel: '인프라 토폴로지', icon: Network },
  '/links':              { defaultLabel: '클러스터 링크',  icon: Link2 },
  '/node-labels':        { defaultLabel: '노드 라벨',      icon: Tags },
  '/cidr':               { defaultLabel: 'CIDR 계산기',    icon: Calculator },
  '/incident-analysis':  { defaultLabel: '장애 로그 분석', icon: Zap },
  '/packet-flow':        { defaultLabel: '패킷 흐름 분석', icon: Route },
  '/ontology':           { defaultLabel: '온톨로지 그래프', icon: Share2 },
  '/trends':             { defaultLabel: '기술 동향',      icon: Rss },
  '/work-guides':        { defaultLabel: '작업 가이드',    icon: BookMarked },
  '/ops-notes':          { defaultLabel: '업무 게시판',    icon: Layers },
  '/wbs':                { defaultLabel: 'WBS 작업흐름',   icon: BarChart3 },
  '/mindmap':            { defaultLabel: '마인드맵',       icon: Map },
  '/workflow':           { defaultLabel: '워크플로우',     icon: GitFork },
  '/settings':           { defaultLabel: 'Settings',       icon: Settings },
};

const NAV_GROUPS: Array<{ id: string; label: string; paths: string[] }> = [
  { id: 'monitoring', label: '모니터링',   paths: ['/', '/playbooks'] },
  { id: 'work',       label: '작업관리',   paths: ['/issues', '/tasks', '/todo-today', '/members'] },
  { id: 'cluster',    label: '클러스터',   paths: ['/cluster-manage', '/versions', '/bulk-exec', '/etcdctl', '/mc', '/kernel-params', '/infra-topology', '/links', '/node-labels', '/cidr'] },
  { id: 'analysis',   label: 'AI 분석',    paths: ['/incident-analysis', '/packet-flow', '/ontology', '/trends'] },
  { id: 'docs',       label: '운영/문서',  paths: ['/work-guides', '/ops-notes', '/wbs', '/mindmap', '/workflow'] },
  { id: 'system',     label: '시스템',     paths: ['/settings'] },
];

const DEFAULT_TITLE = 'K8s Daily Monitor';
const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const THEME_LABEL: Record<Theme, string> = { dark: '다크', light: '라이트', system: '시스템' };

// ── Tooltip (우측 hover 박스) ───────────────────────────────────────────────

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1
                   bg-card border border-border rounded-md shadow-lg text-xs font-medium text-foreground
                   whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150
                   z-50"
      >
        {label}
      </span>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();
  const { data: settings } = useUiSettings();
  const updateSettings = useUpdateUiSettings();

  const [editMode, setEditMode] = useState(false);          // 편집 패널 오버레이
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingNavPath, setEditingNavPath] = useState<string | null>(null);

  const title = settings?.appTitle || DEFAULT_TITLE;
  const navLabels = useMemo(() => settings?.navLabels || {}, [settings?.navLabels]);
  const getLabel = (path: string) => navLabels[path] || NAV_MAP[path]?.defaultLabel || path;

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
      {/* ── 아이콘 레일 (항상 표시, w-16) ──────────────────────────────────── */}
      <aside className="fixed top-0 left-0 h-full w-16 bg-card border-r border-border flex flex-col z-40">
        {/* 타이틀 (앱 아이콘) */}
        <div className="py-4 flex flex-col items-center border-b border-border">
          <Tooltip label={title}>
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-700 rounded-xl flex items-center justify-center text-white text-lg shadow-sm">
              ☸
            </div>
          </Tooltip>
        </div>

        {/* 네비 아이콘 */}
        <nav className="flex-1 py-2 overflow-y-auto" aria-label="메인 네비게이션">
          {NAV_GROUPS.map(({ id, paths }, groupIdx) => {
            const validPaths = paths.filter((p) => NAV_MAP[p]);
            if (validPaths.length === 0) return null;
            return (
              <div key={id}>
                {groupIdx > 0 && <div className="mx-3 my-1.5 border-t border-border/40" aria-hidden="true" />}
                <div className="flex flex-col items-center gap-0.5 px-1.5 py-1">
                  {validPaths.map((path) => {
                    const { icon: Icon } = NAV_MAP[path];
                    const isActive = location.pathname === path;
                    const itemLabel = getLabel(path);
                    return (
                      <Tooltip key={path} label={itemLabel}>
                        <Link
                          to={path}
                          aria-label={itemLabel}
                          aria-current={isActive ? 'page' : undefined}
                          className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all ${
                            isActive
                              ? 'bg-primary/15 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          }`}
                        >
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[3px] w-1 h-5 bg-primary rounded-r"
                            />
                          )}
                          <Icon className="w-[18px] h-[18px]" />
                        </Link>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* 푸터 */}
        <div className="py-2 border-t border-border flex flex-col items-center gap-1">
          <Tooltip label="메뉴 이름 편집">
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                editMode
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            </button>
          </Tooltip>
          <Tooltip label={`테마: ${THEME_LABEL[theme]} (클릭하여 변경)`}>
            <button
              onClick={() => setTheme(THEME_CYCLE[theme])}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="테마 변경"
            >
              {theme === 'dark' && <Moon className="w-[18px] h-[18px]" />}
              {theme === 'light' && <Sun className="w-[18px] h-[18px]" />}
              {theme === 'system' && <Monitor className="w-[18px] h-[18px]" />}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* ── 편집 오버레이 패널 (아이콘 레일 우측에 붙음) ─────────────────────── */}
      {editMode && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setEditMode(false)}
            aria-hidden="true"
          />
          <aside className="fixed top-0 left-16 h-full w-60 bg-card border-r border-border shadow-2xl flex flex-col z-40">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span className="text-sm font-semibold flex-1">메뉴 편집</span>
              <button onClick={() => setEditMode(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                title="닫기 (Esc)">
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
              {NAV_GROUPS.map(({ id, label, paths }) => (
                <div key={id} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</p>
                  <div className="space-y-0.5">
                    {paths.map((path) => {
                      const navItem = NAV_MAP[path];
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
              이름만 수정됩니다. 외부 클릭으로 닫기.
            </div>
          </aside>
        </>
      )}
    </>
  );
}
