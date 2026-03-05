import { useState, useMemo } from 'react';
import {
  BookMarked, Plus, Pencil, Trash2, X, Search, GitFork, Tag,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle, FileText, Archive,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workGuidesApi, workflowsApi } from '@/services/api';
import type { WorkGuide, WorkGuideCreate, WorkGuideUpdate } from '@/types';

// ── 상수 ─────────────────────────────────────────────────────────────────────
const CATEGORIES = ['배포', '트러블슈팅', '모니터링', '보안', '기타'];

const PRIORITY_CFG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  high:   { label: '높음', dot: 'bg-red-400',    text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  medium: { label: '보통', dot: 'bg-blue-400',   text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  low:    { label: '낮음', dot: 'bg-slate-400',  text: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/30' },
};

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
  draft:    { label: '초안', icon: <FileText className="w-3 h-3" />,    bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30' },
  active:   { label: '활성', icon: <CheckCircle className="w-3 h-3" />, bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  archived: { label: '보관', icon: <Archive className="w-3 h-3" />,     bg: 'bg-zinc-500/10',    text: 'text-zinc-400',    border: 'border-zinc-500/30' },
};

const CATEGORY_COLORS: Record<string, string> = {
  '배포':       'bg-violet-500/10 text-violet-400 border-violet-500/30',
  '트러블슈팅': 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  '모니터링':   'bg-cyan-500/10   text-cyan-400   border-cyan-500/30',
  '보안':       'bg-red-500/10    text-red-400    border-red-500/30',
  '기타':       'bg-slate-500/10  text-slate-400  border-slate-500/30',
};

const REF_TYPE = 'work_guide';

// ── 가이드 폼 모달 ────────────────────────────────────────────────────────────
interface GuideFormModalProps {
  initial?: WorkGuide | null;
  onClose: () => void;
  onSaved: () => void;
}

function GuideFormModal({ initial, onClose, onSaved }: GuideFormModalProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial);

  const [title, setTitle]       = useState(initial?.title ?? '');
  const [content, setContent]   = useState(initial?.content ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [priority, setPriority] = useState(initial?.priority ?? 'medium');
  const [tags, setTags]         = useState(initial?.tags ?? '');
  const [status, setStatus]     = useState(initial?.status ?? 'draft');
  const [author, setAuthor]     = useState(initial?.author ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['work-guides'] });

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
      };
      if (isEdit && initial) {
        await workGuidesApi.update(initial.id, payload as WorkGuideUpdate);
      } else {
        await workGuidesApi.create(payload);
      }
      invalidate();
      onSaved();
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
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{isEdit ? '가이드 수정' : '새 작업 가이드'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>제목 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="가이드 제목" className={inputCls} />
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
            <label className={labelCls}>내용</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="가이드 내용, 단계별 절차, 주의사항 등을 입력하세요..."
              rows={10} className={`${inputCls} resize-y font-mono text-xs leading-relaxed`} />
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

// ── 워크플로에 추가 모달 ───────────────────────────────────────────────────────
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
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md"><X className="w-4 h-4" /></button>
        </div>

        <p className="text-xs text-muted-foreground mb-4 bg-secondary/50 rounded-lg p-2.5 border border-border">
          <span className="font-medium text-foreground">{guide.title}</span>
          {' '}가이드를 워크플로 노드로 연결합니다.
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
                <p className="text-xs text-muted-foreground">등록된 워크플로가 없습니다. 워크플로 페이지에서 먼저 생성하세요.</p>
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

// ── 가이드 카드 ───────────────────────────────────────────────────────────────
interface GuideCardProps {
  guide: WorkGuide;
  onEdit: (g: WorkGuide) => void;
  onDelete: (g: WorkGuide) => void;
  onAddToWorkflow: (g: WorkGuide) => void;
  onDetail: (g: WorkGuide) => void;
}

function GuideCard({ guide, onEdit, onDelete, onAddToWorkflow, onDetail }: GuideCardProps) {
  const pc = PRIORITY_CFG[guide.priority] ?? PRIORITY_CFG.medium;
  const sc = STATUS_CFG[guide.status]     ?? STATUS_CFG.draft;
  const cc = guide.category ? (CATEGORY_COLORS[guide.category] ?? CATEGORY_COLORS['기타']) : null;
  const tagList = guide.tags ? guide.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors group">
      {/* top badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {guide.category && cc && (
          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cc}`}>
            {guide.category}
          </span>
        )}
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${pc.bg} ${pc.text} ${pc.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
          {pc.label}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
          {sc.icon}{sc.label}
        </span>
      </div>

      {/* title */}
      <div
        className="cursor-pointer group/title"
        onClick={() => onDetail(guide)}
      >
        <h3 className="text-sm font-semibold leading-snug group-hover/title:text-primary transition-colors line-clamp-2">
          {guide.title}
        </h3>
      </div>

      {/* content preview */}
      {guide.content && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 cursor-pointer"
          onClick={() => onDetail(guide)}>
          {guide.content}
        </p>
      )}

      {/* tags */}
      {tagList.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {tagList.slice(0, 5).map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              <Tag className="w-2.5 h-2.5" />{t}
            </span>
          ))}
          {tagList.length > 5 && (
            <span className="text-[10px] text-muted-foreground/60">+{tagList.length - 5}</span>
          )}
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 mt-auto">
        <div className="text-[10px] text-muted-foreground/60">
          {guide.author && <span className="mr-2">✍ {guide.author}</span>}
          {guide.createdAt?.slice(0, 10)}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAddToWorkflow(guide)}
            className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            title="워크플로에 추가"
          >
            <GitFork className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(guide)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="수정"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(guide)}
            className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
            title="삭제"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 상세 모달 ─────────────────────────────────────────────────────────────────
function GuideDetailModal({ guide, onClose, onEdit }: { guide: WorkGuide; onClose: () => void; onEdit: () => void }) {
  const pc = PRIORITY_CFG[guide.priority] ?? PRIORITY_CFG.medium;
  const sc = STATUS_CFG[guide.status]     ?? STATUS_CFG.draft;
  const cc = guide.category ? (CATEGORY_COLORS[guide.category] ?? CATEGORY_COLORS['기타']) : null;
  const tagList = guide.tags ? guide.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {guide.category && cc && (
                <span className={`inline-flex text-[11px] px-2 py-0.5 rounded-full border ${cc}`}>{guide.category}</span>
              )}
              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${pc.bg} ${pc.text} ${pc.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />{pc.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
                {sc.icon}{sc.label}
              </span>
            </div>
            <h2 className="text-lg font-bold leading-snug">{guide.title}</h2>
            {(guide.author || guide.createdAt) && (
              <p className="text-xs text-muted-foreground mt-1">
                {guide.author && <span className="mr-2">작성자: {guide.author}</span>}
                등록: {guide.createdAt?.slice(0, 10)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {tagList.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mb-4">
            {tagList.map((t) => (
              <span key={t} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                <Tag className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
        )}

        {guide.content ? (
          <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed bg-muted/20 rounded-lg p-4 border border-border/50">
            {guide.content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground italic">내용이 없습니다.</p>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onEdit}
            className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-2">
            <Pencil className="w-4 h-4" /> 수정
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function WorkGuidePage() {
  const qc = useQueryClient();

  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch]                 = useState('');
  const [sortDir, setSortDir]               = useState<'desc' | 'asc'>('desc');

  const [showForm, setShowForm]             = useState(false);
  const [editGuide, setEditGuide]           = useState<WorkGuide | null>(null);
  const [detailGuide, setDetailGuide]       = useState<WorkGuide | null>(null);
  const [addToWfGuide, setAddToWfGuide]     = useState<WorkGuide | null>(null);
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['work-guides'],
    queryFn: () => workGuidesApi.getAll().then((r) => r.data),
    staleTime: 1000 * 30,
  });
  const allGuides = data?.data ?? [];

  const guides = useMemo(() => {
    let list = allGuides;
    if (filterCategory) list = list.filter((g) => g.category === filterCategory);
    if (filterStatus)   list = list.filter((g) => g.status === filterStatus);
    if (filterPriority) list = list.filter((g) => g.priority === filterPriority);
    if (search.trim())  list = list.filter((g) =>
      g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.content?.toLowerCase().includes(search.toLowerCase()) ||
      g.tags?.toLowerCase().includes(search.toLowerCase()) ||
      g.author?.toLowerCase().includes(search.toLowerCase())
    );
    return [...list].sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [allGuides, filterCategory, filterStatus, filterPriority, search, sortDir]);

  const handleDelete = async (guide: WorkGuide) => {
    if (!confirm(`"${guide.title}" 가이드를 삭제하시겠습니까?`)) return;
    setDeletingId(guide.id);
    try {
      await workGuidesApi.delete(guide.id);
      qc.invalidateQueries({ queryKey: ['work-guides'] });
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const statsActive   = allGuides.filter((g) => g.status === 'active').length;
  const statsDraft    = allGuides.filter((g) => g.status === 'draft').length;
  const statsArchived = allGuides.filter((g) => g.status === 'archived').length;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookMarked className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">작업 가이드</h1>
            {allGuides.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                전체 {allGuides.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditGuide(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> 새 가이드
          </button>
        </div>

        {/* Stats */}
        {allGuides.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: '활성', count: statsActive,   ...STATUS_CFG.active   },
              { label: '초안', count: statsDraft,    ...STATUS_CFG.draft    },
              { label: '보관', count: statsArchived, ...STATUS_CFG.archived },
            ].map(({ label, count, bg, text, border }) => (
              <div key={label} className={`rounded-xl border px-4 py-3 flex items-center justify-between ${bg} ${border}`}>
                <span className={`text-sm font-medium ${text}`}>{label}</span>
                <span className={`text-2xl font-bold ${text}`}>{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목, 내용, 태그 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none">
            <option value="">전체 카테고리</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none">
            <option value="">전체 우선순위</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none">
            <option value="">전체 상태</option>
            <option value="active">활성</option>
            <option value="draft">초안</option>
            <option value="archived">보관</option>
          </select>
          <button
            onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-background border border-border rounded-lg hover:bg-secondary transition-colors"
            title="등록일 정렬"
          >
            {sortDir === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            등록일
          </button>
          {(filterCategory || filterStatus || filterPriority || search) && (
            <button
              onClick={() => { setFilterCategory(''); setFilterStatus(''); setFilterPriority(''); setSearch(''); }}
              className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" /> 필터 초기화
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">불러오는 중...</div>
        ) : guides.length === 0 ? (
          <div className="text-center py-20">
            <BookMarked className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {allGuides.length === 0 ? '등록된 작업 가이드가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
            {allGuides.length === 0 && (
              <button onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> 첫 번째 가이드 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {guides.map((guide) => (
              <div key={guide.id} className={deletingId === guide.id ? 'opacity-40 pointer-events-none' : ''}>
                <GuideCard
                  guide={guide}
                  onEdit={(g) => { setEditGuide(g); setShowForm(true); }}
                  onDelete={handleDelete}
                  onAddToWorkflow={(g) => setAddToWfGuide(g)}
                  onDetail={(g) => setDetailGuide(g)}
                />
              </div>
            ))}
          </div>
        )}

      </main>

      {/* 가이드 폼 모달 */}
      {showForm && (
        <GuideFormModal
          initial={editGuide}
          onClose={() => { setShowForm(false); setEditGuide(null); }}
          onSaved={() => {}}
        />
      )}

      {/* 상세 모달 */}
      {detailGuide && !showForm && (
        <GuideDetailModal
          guide={detailGuide}
          onClose={() => setDetailGuide(null)}
          onEdit={() => { setEditGuide(detailGuide); setDetailGuide(null); setShowForm(true); }}
        />
      )}

      {/* 워크플로에 추가 모달 */}
      {addToWfGuide && (
        <AddToWorkflowModal
          guide={addToWfGuide}
          onClose={() => setAddToWfGuide(null)}
        />
      )}
    </div>
  );
}
