import { useState, useMemo } from 'react';
import {
  BookMarked, Plus, Pencil, Trash2, X, GitFork,
  ChevronRight, ChevronDown, FolderOpen, Folder,
  FileText, CheckCircle, Archive, AlertCircle,
} from 'lucide-react';
import { RichTextEditor, RichContent } from '@/components/editor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { workGuidesApi, workflowsApi } from '@/services/api';
import type { WorkGuide, WorkGuideCreate, WorkGuideUpdate } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ['배포', '트러블슈팅', '모니터링', '보안', '기타'];

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  draft:    { label: '초안', icon: <FileText className="w-3 h-3" />,    cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30' },
  active:   { label: '활성', icon: <CheckCircle className="w-3 h-3" />, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  archived: { label: '보관', icon: <Archive className="w-3 h-3" />,     cls: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
};

const PRIORITY_DOT: Record<string, { dot: string; cls: string; label: string }> = {
  high:   { dot: 'bg-red-400',   cls: 'text-red-400',   label: '높음' },
  medium: { dot: 'bg-blue-400',  cls: 'text-blue-400',  label: '보통' },
  low:    { dot: 'bg-slate-400', cls: 'text-slate-400', label: '낮음' },
};

const REF_TYPE = 'work_guide';

// ── Tree node ─────────────────────────────────────────────────────────────────
interface TreeNodeProps {
  guide: WorkGuide;
  childGuides: WorkGuide[];
  allGuides: WorkGuide[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({ guide, childGuides, allGuides, depth, selectedId, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = childGuides.length > 0;
  const isSelected = selectedId === guide.id;
  const sc = STATUS_CFG[guide.status] ?? STATUS_CFG.draft;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 pr-2 rounded-lg cursor-pointer transition-colors text-sm ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(guide.id)}
      >
        {hasChildren ? (
          <span
            className="p-0.5 rounded flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        {hasChildren
          ? (expanded
              ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-primary/60" />
              : <Folder className="w-3.5 h-3.5 flex-shrink-0 text-primary/60" />)
          : <FileText className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="flex-1 min-w-0 truncate">{guide.title}</span>
        <span className={`inline-flex items-center text-[10px] px-1 py-0.5 rounded-full border flex-shrink-0 ${sc.cls}`}>
          {sc.icon}
        </span>
      </div>

      {expanded && hasChildren && (
        <div>
          {childGuides.map((child) => (
            <TreeNode
              key={child.id}
              guide={child}
              childGuides={allGuides.filter((g) => g.parentId === child.id)}
              allGuides={allGuides}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ guide, allGuides, onSelect }: { guide: WorkGuide; allGuides: WorkGuide[]; onSelect: (id: string) => void }) {
  const ancestors: WorkGuide[] = [];
  let cur: WorkGuide | undefined = guide;
  while (cur?.parentId) {
    const parent = allGuides.find((g) => g.id === cur!.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    cur = parent;
  }
  if (ancestors.length === 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4 flex-wrap">
      {ancestors.map((a) => (
        <span key={a.id} className="flex items-center gap-1">
          <button onClick={() => onSelect(a.id)} className="hover:text-primary transition-colors truncate max-w-[140px]">
            {a.title}
          </button>
          <ChevronRight className="w-3 h-3 flex-shrink-0" />
        </span>
      ))}
      <span className="text-foreground font-medium truncate max-w-[200px]">{guide.title}</span>
    </div>
  );
}

// ── Guide form modal ──────────────────────────────────────────────────────────
interface GuideFormModalProps {
  initial?: WorkGuide | null;
  allGuides: WorkGuide[];
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved: (id?: string) => void;
}

function GuideFormModal({ initial, allGuides, defaultParentId, onClose, onSaved }: GuideFormModalProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial);

  const [title, setTitle]       = useState(initial?.title ?? '');
  const [content, setContent]   = useState(initial?.content ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [priority, setPriority] = useState(initial?.priority ?? 'medium');
  const [tags, setTags]         = useState(initial?.tags ?? '');
  const [status, setStatus]     = useState(initial?.status ?? 'draft');
  const [author, setAuthor]     = useState(initial?.author ?? '');
  const [parentId, setParentId] = useState<string>(
    initial?.parentId ?? defaultParentId ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const getDescendantIds = (id: string): string[] => {
    const kids = allGuides.filter((g) => g.parentId === id);
    return [id, ...kids.flatMap((k) => getDescendantIds(k.id))];
  };
  const excludeIds = isEdit && initial ? new Set(getDescendantIds(initial.id)) : new Set<string>();
  const parentOptions = allGuides.filter((g) => !excludeIds.has(g.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('제목은 필수입니다.'); return; }
    setSaving(true); setError('');
    try {
      const payload: WorkGuideCreate = {
        title: title.trim(),
        content: content.trim() || undefined,
        category: category || undefined,
        priority,
        tags: tags.trim() || undefined,
        status,
        author: author.trim() || undefined,
        parentId: parentId || null,
      };
      if (isEdit && initial) {
        await workGuidesApi.update(initial.id, payload as WorkGuideUpdate);
        await qc.invalidateQueries({ queryKey: ['work-guides'] });
        onSaved(initial.id);
      } else {
        const res = await workGuidesApi.create(payload);
        await qc.invalidateQueries({ queryKey: ['work-guides'] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSaved((res.data as any)?.id ?? (res.data as any)?.data?.id);
      }
      onClose();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'block text-sm font-medium mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{isEdit ? '페이지 수정' : '새 페이지'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="페이지 제목"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>상위 페이지</label>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputCls}>
              <option value="">— 최상위 페이지 —</option>
              {parentOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="">— 선택 —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="draft">초안</option>
                <option value="active">활성</option>
                <option value="archived">보관</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>작성자</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                placeholder="이름 또는 팀명" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>태그 (쉼표 구분)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
                placeholder="예: k8s, nginx, 긴급" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">내용</label>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="페이지 내용을 작성하세요. 서식 도구모음을 사용하여 Confluence처럼 편집할 수 있습니다."
              minHeight="260px"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-60">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add to workflow modal ─────────────────────────────────────────────────────
interface AddToWorkflowModalProps {
  guide: WorkGuide;
  onClose: () => void;
}

function AddToWorkflowModal({ guide, onClose }: AddToWorkflowModalProps) {
  const [selectedWfId, setSelectedWfId] = useState('');
  const [adding, setAdding]             = useState(false);
  const [done, setDone]                 = useState(false);
  const [error, setError]               = useState('');

  const { data: wfData } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.getAll().then((r) => r.data),
    staleTime: 1000 * 10,
  });
  const workflows = wfData?.data ?? [];

  const handleAdd = async () => {
    if (!selectedWfId) { setError('워크플로를 선택해 주세요.'); return; }
    setAdding(true); setError('');
    try {
      const wf = workflows.find((w) => w.id === selectedWfId);
      await workflowsApi.createStep(selectedWfId, {
        title: guide.title,
        description: guide.content?.slice(0, 120) || undefined,
        referenceType: REF_TYPE,
        referenceId: guide.id,
        stepType: 'action',
        orderIndex: wf ? wf.steps.length : 0,
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError('추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">워크플로에 노드로 추가</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4 bg-secondary/50 rounded-lg p-2.5 border border-border">
          <span className="font-medium text-foreground">{guide.title}</span>{' '}가이드를 워크플로 노드로 연결합니다.
        </p>
        {done ? (
          <div className="flex items-center gap-2 text-sm text-emerald-400 py-2">
            <CheckCircle className="w-4 h-4" /> 워크플로에 추가되었습니다!
          </div>
        ) : (
          <>
            {error && <p className="text-xs text-destructive mb-3">{error}</p>}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">워크플로 선택</label>
              {workflows.length === 0 ? (
                <p className="text-xs text-muted-foreground">등록된 워크플로가 없습니다.</p>
              ) : (
                <select
                  value={selectedWfId}
                  onChange={(e) => setSelectedWfId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— 선택 —</option>
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>{wf.title} ({wf.steps.length}단계)</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose}
                className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors">
                취소
              </button>
              <button onClick={handleAdd} disabled={adding || workflows.length === 0}
                className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5">
                <GitFork className="w-3.5 h-3.5" />
                {adding ? '추가 중...' : '워크플로에 추가'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page view (full content area) ─────────────────────────────────────────────
interface PageViewProps {
  guide: WorkGuide;
  allGuides: WorkGuide[];
  onSelect: (id: string) => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAddToWorkflow: () => void;
  onDelete: () => void;
}

function PageView({ guide, allGuides, onSelect, onEdit, onAddChild, onAddToWorkflow, onDelete }: PageViewProps) {
  const sc = STATUS_CFG[guide.status] ?? STATUS_CFG.draft;
  const pc = PRIORITY_DOT[guide.priority] ?? PRIORITY_DOT.medium;
  const tagList = guide.tags ? guide.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const childPages = allGuides.filter((g) => g.parentId === guide.id);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-10 py-8">
        <Breadcrumb guide={guide} allGuides={allGuides} onSelect={onSelect} />

        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight mb-3">{guide.title}</h1>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {guide.category && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {guide.category}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${sc.cls}`}>
                {sc.icon}{sc.label}
              </span>
              <span className={`font-medium ${pc.cls}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${pc.dot} mr-1`} />
                {pc.label}
              </span>
              {guide.author && <span className="text-muted-foreground">✍ {guide.author}</span>}
              <span className="text-muted-foreground">{guide.updatedAt?.slice(0, 10)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onAddToWorkflow}
              className="p-2 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
              title="워크플로에 추가">
              <GitFork className="w-4 h-4" />
            </button>
            <button onClick={onAddChild}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="하위 페이지 추가">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={onEdit}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="수정">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onDelete}
              className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
              title="삭제">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {tagList.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-5">
            {tagList.map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">#{t}</span>
            ))}
          </div>
        )}

        <div className="min-h-[120px]">
          <RichContent content={guide.content ?? ''} />
        </div>

        {childPages.length > 0 && (
          <div className="mt-10 pt-6 border-t border-border">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">하위 페이지 ({childPages.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {childPages.map((child) => {
                const csc = STATUS_CFG[child.status] ?? STATUS_CFG.draft;
                return (
                  <button key={child.id} onClick={() => onSelect(child.id)}
                    className="flex items-center gap-2 p-3 bg-secondary/40 hover:bg-secondary rounded-lg text-left transition-colors group">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 text-sm font-medium group-hover:text-primary transition-colors truncate">
                      {child.title}
                    </span>
                    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${csc.cls}`}>
                      {csc.icon}{csc.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function WorkGuidePage() {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [editGuide, setEditGuide]   = useState<WorkGuide | null>(null);
  const [addChildOf, setAddChildOf] = useState<string | null>(null);
  const [addToWf, setAddToWf]       = useState<WorkGuide | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['work-guides'],
    queryFn: () => workGuidesApi.getAll().then((r) => r.data),
    staleTime: 1000 * 30,
  });

  const allGuides = useMemo(
    () => (data?.data ?? []).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [data],
  );

  const selectedGuide = allGuides.find((g) => g.id === selectedId) ?? null;
  const rootGuides = allGuides.filter((g) => !g.parentId);

  const handleDelete = async (guide: WorkGuide) => {
    if (!confirm(`"${guide.title}" 페이지를 삭제하시겠습니까?`)) return;
    try {
      await workGuidesApi.delete(guide.id);
      qc.invalidateQueries({ queryKey: ['work-guides'] });
      if (selectedId === guide.id) setSelectedId(null);
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const openNewForm = () => {
    setEditGuide(null);
    setAddChildOf(null);
    setShowForm(true);
  };

  const openChildForm = (parentId: string) => {
    setEditGuide(null);
    setAddChildOf(parentId);
    setShowForm(true);
  };

  return (
    <div className="flex bg-background" style={{ height: '100vh' }}>
      {/* Sidebar tree */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">작업 가이드</span>
          </div>
          <button
            onClick={openNewForm}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
            title="새 페이지"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          {isLoading ? (
            <div className="text-xs text-muted-foreground text-center py-6">불러오는 중...</div>
          ) : rootGuides.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              페이지가 없습니다
            </div>
          ) : (
            rootGuides.map((guide) => (
              <TreeNode
                key={guide.id}
                guide={guide}
                childGuides={allGuides.filter((g) => g.parentId === guide.id)}
                allGuides={allGuides}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-border flex-shrink-0">
          <p className="text-[10px] text-muted-foreground">전체 {allGuides.length}개 페이지</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {selectedGuide ? (
          <PageView
            guide={selectedGuide}
            allGuides={allGuides}
            onSelect={setSelectedId}
            onEdit={() => { setEditGuide(selectedGuide); setAddChildOf(null); setShowForm(true); }}
            onAddChild={() => openChildForm(selectedGuide.id)}
            onAddToWorkflow={() => setAddToWf(selectedGuide)}
            onDelete={() => handleDelete(selectedGuide)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <BookMarked className="w-16 h-16 text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">작업 가이드</h2>
            <p className="text-muted-foreground mb-6 max-w-md text-sm leading-relaxed">
              운영 절차, 배포 가이드, 트러블슈팅 등 팀의 지식을 계층적으로 관리하세요.
              왼쪽 트리에서 페이지를 선택하거나 새 페이지를 만드세요.
            </p>
            <button
              onClick={openNewForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> 첫 번째 페이지 만들기
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showForm && (
        <GuideFormModal
          initial={editGuide}
          allGuides={allGuides}
          defaultParentId={addChildOf}
          onClose={() => { setShowForm(false); setEditGuide(null); setAddChildOf(null); }}
          onSaved={(newId) => { if (newId) setSelectedId(newId); }}
        />
      )}

      {addToWf && (
        <AddToWorkflowModal
          guide={addToWf}
          onClose={() => setAddToWf(null)}
        />
      )}
    </div>
  );
}
