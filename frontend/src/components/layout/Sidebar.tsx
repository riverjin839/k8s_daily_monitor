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
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/playbooks', label: 'Playbooks', icon: BookOpen },
  { to: '/issues', label: '이슈 게시판', icon: ClipboardList },
  { to: '/tasks', label: '작업 게시판', icon: ListTodo },
  { to: '/links', label: '클러스터 링크', icon: Link2 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const TITLE_KEY = 'k8s-monitor-app-title';
const DEFAULT_TITLE = 'K8s Daily Monitor';

export function Sidebar() {
  const location = useLocation();
  const [title, setTitle] = useState(() => localStorage.getItem(TITLE_KEY) || DEFAULT_TITLE);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editValue, setEditValue] = useState(title);

  const handleTitleSave = () => {
    const newTitle = editValue.trim() || DEFAULT_TITLE;
    setTitle(newTitle);
    localStorage.setItem(TITLE_KEY, newTitle);
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setEditValue(title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') handleTitleCancel();
  };

  const startEdit = () => {
    setEditValue(title);
    setIsEditingTitle(true);
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
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
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
                onClick={startEdit}
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
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </Link>
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
