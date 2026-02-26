import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  ClipboardList,
  ListTodo,
  Settings,
  Link2,
  Pencil,
  Check,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', defaultLabel: 'Dashboard', icon: LayoutDashboard },
  { to: '/playbooks', defaultLabel: 'Playbooks', icon: BookOpen },
  { to: '/issues', defaultLabel: '이슈 게시판', icon: ClipboardList },
  { to: '/tasks', defaultLabel: '작업 게시판', icon: ListTodo },
  { to: '/links', defaultLabel: '클러스터 링크', icon: Link2 },
  { to: '/settings', defaultLabel: 'Settings', icon: Settings },
];

const TITLE_KEY = 'k8s-monitor-app-title';
const NAV_LABELS_KEY = 'k8s:nav-labels';
const DEFAULT_TITLE = 'K8s Daily Monitor';

function loadNavLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAV_LABELS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* empty */ }
  return {};
}

function saveNavLabels(labels: Record<string, string>) {
  localStorage.setItem(NAV_LABELS_KEY, JSON.stringify(labels));
}

export function Sidebar() {
  const location = useLocation();

  // App title editing
  const [title, setTitle] = useState(() => localStorage.getItem(TITLE_KEY) || DEFAULT_TITLE);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title);

  // Nav label editing
  const [navLabels, setNavLabels] = useState<Record<string, string>>(loadNavLabels);
  const [editingNavPath, setEditingNavPath] = useState<string | null>(null);
  const [editNavValue, setEditNavValue] = useState('');

  const getLabel = (to: string, defaultLabel: string) => navLabels[to] || defaultLabel;

  /* ---- Title handlers ---- */
  const handleTitleSave = () => {
    const newTitle = editTitleValue.trim() || DEFAULT_TITLE;
    setTitle(newTitle);
    localStorage.setItem(TITLE_KEY, newTitle);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditTitleValue(title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') handleTitleCancel();
  };

  const startTitleEdit = () => {
    setEditTitleValue(title);
    setIsEditingTitle(true);
  };

  /* ---- Nav label handlers ---- */
  const startNavEdit = (e: React.MouseEvent, to: string, defaultLabel: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditNavValue(getLabel(to, defaultLabel));
    setEditingNavPath(to);
  };

  const saveNavLabel = (to: string) => {
    const updated = { ...navLabels, [to]: editNavValue.trim() || '' };
    // Remove blank entries (revert to default)
    if (!editNavValue.trim()) delete updated[to];
    setNavLabels(updated);
    saveNavLabels(updated);
    setEditingNavPath(null);
  };

  const cancelNavEdit = () => {
    setEditingNavPath(null);
  };

  const handleNavKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, to: string) => {
    if (e.key === 'Enter') saveNavLabel(to);
    if (e.key === 'Escape') cancelNavEdit();
  };

  return (
    <aside className="fixed top-0 left-0 h-full w-[220px] bg-card border-r border-border flex flex-col z-40">
      {/* Logo + Editable Title */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-blue-700 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0 mt-0.5">
            ☸
          </div>
          {isEditingTitle ? (
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                className="w-full px-1.5 py-0.5 text-sm font-semibold bg-secondary border border-primary rounded focus:outline-none"
                autoFocus
              />
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={handleTitleSave}
                  className="p-0.5 text-primary hover:text-primary/80"
                  title="저장"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleTitleCancel}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                  title="취소"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 group flex items-start gap-1">
              <span className="font-semibold text-sm leading-tight break-words flex-1">{title}</span>
              <button
                onClick={startTitleEdit}
                className="p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity flex-shrink-0 mt-0.5"
                title="제목 수정"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ to, defaultLabel, icon: Icon }) => {
          const isActive = location.pathname === to;
          const label = getLabel(to, defaultLabel);
          const isEditing = editingNavPath === to;

          if (isEditing) {
            return (
              <div
                key={to}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-primary/30"
              >
                <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={editNavValue}
                  onChange={(e) => setEditNavValue(e.target.value)}
                  onKeyDown={(e) => handleNavKeyDown(e, to)}
                  className="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => saveNavLabel(to)}
                  className="p-0.5 text-primary hover:text-primary/80 flex-shrink-0"
                  title="저장"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={cancelNavEdit}
                  className="p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
                  title="취소"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          }

          return (
            <div key={to} className="group relative">
              <Link
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">{label}</span>
              </Link>
              <button
                onClick={(e) => startNavEdit(e, to, defaultLabel)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity rounded"
                title="메뉴 이름 수정"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">K8s Daily Monitor</p>
      </div>
    </aside>
  );
}
