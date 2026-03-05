import { useState, useMemo } from 'react';
import {
  Layers, Plus, Pencil, Trash2, X, Pin, PinOff, Search, RotateCcw,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { opsNotesApi } from '@/services/api';
import type { OpsNote, OpsNoteCreate, OpsNoteColor, OpsNoteUpdate } from '@/types';

// ── 서비스 목록 ───────────────────────────────────────────────────────────────
const SERVICES = [
  { value: 'k8s',       label: 'Kubernetes',  icon: '☸', bg: 'bg-sky-500' },
  { value: 'keycloak',  label: 'Keycloak',    icon: '🔑', bg: 'bg-orange-500' },
  { value: 'cilium',    label: 'Cilium',       icon: '🐝', bg: 'bg-yellow-500' },
  { value: 'jenkins',   label: 'Jenkins',      icon: '🏗', bg: 'bg-blue-500' },
  { value: 'argocd',    label: 'ArgoCD',       icon: '🔄', bg: 'bg-violet-500' },
  { value: 'nexus',     label: 'Nexus',        icon: '📦', bg: 'bg-emerald-500' },
  { value: 'etc',       label: '기타',          icon: '📋', bg: 'bg-slate-500' },
];

const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.value, s]));

// ── 포스트잇 색상 ─────────────────────────────────────────────────────────────
const NOTE_COLORS: Record<OpsNoteColor, { front: string; back: string; fold: string; text: string }> = {
  yellow: { front: 'bg-yellow-200 border-yellow-300', back: 'bg-yellow-100 border-yellow-200', fold: 'border-t-yellow-300 border-r-yellow-300', text: 'text-yellow-900' },
  green:  { front: 'bg-green-200 border-green-300',   back: 'bg-green-100 border-green-200',   fold: 'border-t-green-300 border-r-green-300',   text: 'text-green-900' },
  blue:   { front: 'bg-blue-200 border-blue-300',     back: 'bg-blue-100 border-blue-200',     fold: 'border-t-blue-300 border-r-blue-300',     text: 'text-blue-900' },
  pink:   { front: 'bg-pink-200 border-pink-300',     back: 'bg-pink-100 border-pink-200',     fold: 'border-t-pink-300 border-r-pink-300',     text: 'text-pink-900' },
  purple: { front: 'bg-purple-200 border-purple-300', back: 'bg-purple-100 border-purple-200', fold: 'border-t-purple-300 border-r-purple-300', text: 'text-purple-900' },
};

const COLOR_OPTIONS: { value: OpsNoteColor; label: string; swatch: string }[] = [
  { value: 'yellow', label: '노랑', swatch: 'bg-yellow-300' },
  { value: 'green',  label: '초록', swatch: 'bg-green-300' },
  { value: 'blue',   label: '파랑', swatch: 'bg-blue-300' },
  { value: 'pink',   label: '분홍', swatch: 'bg-pink-300' },
  { value: 'purple', label: '보라', swatch: 'bg-purple-300' },
];

// ── 메모 폼 모달 ───────────────────────────────────────────────────────────────
interface NoteFormModalProps {
  initial?: OpsNote | null;
  defaultService?: string;
  onClose: () => void;
  onSaved: () => void;
}

function NoteFormModal({ initial, defaultService, onClose, onSaved }: NoteFormModalProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(initial);

  const [service, setService]         = useState(initial?.service ?? defaultService ?? 'k8s');
  const [title, setTitle]             = useState(initial?.title ?? '');
  const [content, setContent]         = useState(initial?.content ?? '');
  const [backContent, setBackContent] = useState(initial?.backContent ?? '');
  const [color, setColor]             = useState<OpsNoteColor>(initial?.color ?? 'yellow');
  const [author, setAuthor]           = useState(initial?.author ?? '');
  const [pinned, setPinned]           = useState(initial?.pinned ?? false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ops-notes'] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('제목은 필수입니다.'); return; }
    setSaving(true); setError('');
    try {
      const payload: OpsNoteCreate = {
        service,
        title: title.trim(),
        content: content.trim() || undefined,
        backContent: backContent.trim() || undefined,
        color,
        author: author.trim() || undefined,
        pinned,
      };
      if (isEdit && initial) {
        await opsNotesApi.update(initial.id, payload as OpsNoteUpdate);
      } else {
        await opsNotesApi.create(payload);
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
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{isEdit ? '메모 수정' : '새 메모'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 서비스 선택 */}
          <div>
            <label className={labelCls}>서비스</label>
            <div className="flex gap-2 flex-wrap">
              {SERVICES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setService(s.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    service === s.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <span>{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className={labelCls}>제목 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="메모 제목" className={inputCls} />
          </div>

          {/* 색상 선택 */}
          <div>
            <label className={labelCls}>색상</label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${c.swatch} ${
                    color === c.value ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* 앞면 내용 */}
          <div>
            <label className={labelCls}>앞면 내용</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="포스트잇 앞면에 표시될 내용"
              rows={4} className={`${inputCls} resize-y`} />
          </div>

          {/* 뒷면 내용 */}
          <div>
            <label className={labelCls}>뒷면 내용 <span className="text-muted-foreground font-normal text-xs">(클릭 시 전환)</span></label>
            <textarea value={backContent} onChange={(e) => setBackContent(e.target.value)}
              placeholder="포스트잇 뒷면 — 상세 내역, 히스토리 등"
              rows={4} className={`${inputCls} resize-y`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 작성자 */}
            <div>
              <label className={labelCls}>작성자</label>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)}
                placeholder="이름 또는 팀명" className={inputCls} />
            </div>
            {/* 고정 */}
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-medium">상단 고정</span>
              </label>
            </div>
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

// ── 포스트잇 카드 ──────────────────────────────────────────────────────────────
interface StickyNoteProps {
  note: OpsNote;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

function StickyNote({ note, onEdit, onDelete, onTogglePin }: StickyNoteProps) {
  const [flipped, setFlipped] = useState(false);
  const svc = SERVICE_MAP[note.service];
  const clr = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
  const hasBack = Boolean(note.backContent?.trim());

  return (
    <div className="group relative" style={{ perspective: '1000px' }}>
      {/* 고정 핀 */}
      {note.pinned && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
          <div className="w-3 h-3 bg-red-500 rounded-full shadow-md" />
        </div>
      )}

      {/* 플립 컨테이너 */}
      <div
        className="relative transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '200px',
        }}
      >
        {/* 앞면 */}
        <div
          className={`absolute inset-0 rounded-lg border shadow-md p-4 flex flex-col ${clr.front} ${clr.text}`}
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          {/* 서비스 배지 + 꺾인 모서리 */}
          <div className="flex items-start justify-between mb-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-white ${svc?.bg ?? 'bg-slate-500'}`}>
              {svc?.icon} {svc?.label ?? note.service}
            </span>
            {/* 꺾인 모서리 장식 */}
            <div
              className={`w-0 h-0 flex-shrink-0`}
              style={{
                borderTop: '16px solid transparent',
                borderRight: '16px solid rgba(0,0,0,0.12)',
                borderRadius: '0 0 0 2px',
              }}
            />
          </div>

          <h3 className="text-sm font-bold leading-snug mb-2 line-clamp-2">{note.title}</h3>

          {note.content ? (
            <p className="text-xs leading-relaxed line-clamp-6 flex-1 opacity-80 whitespace-pre-wrap">{note.content}</p>
          ) : (
            <p className="text-xs opacity-40 flex-1 italic">내용 없음</p>
          )}

          {/* 하단 */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/10">
            <div className="text-[10px] opacity-60">
              {note.author && <span className="mr-1.5">✍ {note.author}</span>}
              <span>{note.updatedAt?.slice(0, 10)}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {hasBack && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFlipped(true); }}
                  className="p-1 rounded hover:bg-black/10 transition-colors"
                  title="뒷면 보기"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 뒷면 */}
        <div
          className={`absolute inset-0 rounded-lg border shadow-md p-4 flex flex-col ${clr.back} ${clr.text}`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold opacity-60 uppercase tracking-wide">상세 / 히스토리</span>
            <button
              onClick={(e) => { e.stopPropagation(); setFlipped(false); }}
              className="p-1 rounded hover:bg-black/10 transition-colors"
              title="앞면으로"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          <pre className="text-xs leading-relaxed flex-1 whitespace-pre-wrap font-sans overflow-auto opacity-85">
            {note.backContent || '(내용 없음)'}
          </pre>
        </div>
      </div>

      {/* 호버 액션 버튼들 (플립 위에 렌더링) */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className="p-1 rounded bg-white/70 hover:bg-white text-slate-600 hover:text-primary transition-colors"
          title={note.pinned ? '고정 해제' : '상단 고정'}
        >
          {note.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded bg-white/70 hover:bg-white text-slate-600 hover:text-primary transition-colors"
          title="수정"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded bg-white/70 hover:bg-white text-slate-600 hover:text-red-500 transition-colors"
          title="삭제"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export function OpsNotesPage() {
  const qc = useQueryClient();

  const [filterService, setFilterService] = useState('');
  const [search, setSearch]               = useState('');
  const [showForm, setShowForm]           = useState(false);
  const [editNote, setEditNote]           = useState<OpsNote | null>(null);
  const [deletingId, setDeletingId]       = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ops-notes'],
    queryFn: () => opsNotesApi.getAll().then((r) => r.data),
    staleTime: 1000 * 30,
  });

  const allNotes = useMemo(() => data?.data ?? [], [data]);

  const notes = useMemo(() => {
    let list = allNotes;
    if (filterService) list = list.filter((n) => n.service === filterService);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((n) =>
        n.title.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.backContent?.toLowerCase().includes(q) ||
        n.author?.toLowerCase().includes(q)
      );
    }
    // pinned first, then by updatedAt desc
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [allNotes, filterService, search]);

  const handleDelete = async (note: OpsNote) => {
    if (!confirm(`"${note.title}" 메모를 삭제하시겠습니까?`)) return;
    setDeletingId(note.id);
    try {
      await opsNotesApi.delete(note.id);
      qc.invalidateQueries({ queryKey: ['ops-notes'] });
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePin = async (note: OpsNote) => {
    try {
      await opsNotesApi.update(note.id, { pinned: !note.pinned });
      qc.invalidateQueries({ queryKey: ['ops-notes'] });
    } catch {
      alert('수정에 실패했습니다.');
    }
  };

  // 서비스별 메모 수
  const countByService = useMemo(() =>
    Object.fromEntries(SERVICES.map((s) => [s.value, allNotes.filter((n) => n.service === s.value).length])),
    [allNotes]
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">업무 게시판</h1>
            {allNotes.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                전체 {allNotes.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { setEditNote(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> 새 메모
          </button>
        </div>

        {/* 서비스 탭 + 검색 */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setFilterService('')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              !filterService
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            전체 <span className="text-xs opacity-70">({allNotes.length})</span>
          </button>
          {SERVICES.map((s) => {
            const count = countByService[s.value] ?? 0;
            if (count === 0 && filterService !== s.value) return null;
            return (
              <button
                key={s.value}
                onClick={() => setFilterService(filterService === s.value ? '' : s.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  filterService === s.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span>{s.icon}</span>{s.label}
                <span className="text-xs opacity-70">({count})</span>
              </button>
            );
          })}
          <div className="ml-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="pl-9 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* 메모 그리드 */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-48 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-20">
            <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              {allNotes.length === 0 ? '등록된 메모가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
            {allNotes.length === 0 && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> 첫 번째 메모 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {notes.map((note) => (
              <div key={note.id} className={deletingId === note.id ? 'opacity-40 pointer-events-none' : ''}>
                <StickyNote
                  note={note}
                  onEdit={() => { setEditNote(note); setShowForm(true); }}
                  onDelete={() => handleDelete(note)}
                  onTogglePin={() => handleTogglePin(note)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 폼 모달 */}
      {showForm && (
        <NoteFormModal
          initial={editNote}
          defaultService={filterService || 'k8s'}
          onClose={() => { setShowForm(false); setEditNote(null); }}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
