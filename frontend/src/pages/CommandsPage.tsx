import { useId, useMemo, useState } from 'react';
import {
  Pencil, Plus, Search, Terminal, Trash2, Pin, AlertTriangle, Copy, Check, ExternalLink,
} from 'lucide-react';

import { MacCard } from '@/components/ui/MacCard';
import { ConfirmDialog, ConfluenceUrlInput, useToast } from '@/components/common';
import {
  useCommands, useCreateCommand, useDeleteCommand, useUpdateCommand,
} from '@/hooks/useCommands';
import type { CommandEntry, CommandEntryCreate, CommandImportance } from '@/types';
import { formatApiError } from '@/lib/utils';

// ── 중요도 색상 매핑 ─────────────────────────────────────────────────────────
// info=slate / low=sky / medium=amber / high=orange / critical=red.
// border / bg / text 토큰을 묶어서 행과 뱃지에 모두 적용.
const IMPORTANCE_META: Record<CommandImportance, {
  label: string; badge: string; ring: string; rowAccent: string;
}> = {
  info:     { label: '정보',  badge: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
              ring: 'ring-slate-400/20',  rowAccent: 'border-l-slate-400/60' },
  low:      { label: '낮음',  badge: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
              ring: 'ring-sky-400/20',    rowAccent: 'border-l-sky-500/70' },
  medium:   { label: '보통',  badge: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
              ring: 'ring-amber-400/20',  rowAccent: 'border-l-amber-500/70' },
  high:     { label: '높음',  badge: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
              ring: 'ring-orange-400/20', rowAccent: 'border-l-orange-500/80' },
  critical: { label: '치명',  badge: 'bg-red-500/20 text-red-700 border-red-500/40 font-semibold',
              ring: 'ring-red-400/30',    rowAccent: 'border-l-red-500' },
};

const IMPORTANCE_OPTIONS: CommandImportance[] = ['info', 'low', 'medium', 'high', 'critical'];

function ImportanceBadge({ value }: { value: CommandImportance }) {
  const meta = IMPORTANCE_META[value] ?? IMPORTANCE_META.medium;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${meta.badge}`}>
      {value === 'critical' && <AlertTriangle className="w-3 h-3" />}
      {meta.label}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const onCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => toast.error('복사 실패', '클립보드 권한을 확인해주세요.'));
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title="복사"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary rounded"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? '복사됨' : '복사'}
    </button>
  );
}

// ── 추가/수정 모달 ──────────────────────────────────────────────────────────
interface FormModalProps {
  open: boolean;
  initial?: CommandEntry;
  onClose: () => void;
}

function FormModal({ open, initial, onClose }: FormModalProps) {
  const create = useCreateCommand();
  const update = useUpdateCommand();
  const toast = useToast();

  const [category, setCategory] = useState(initial?.category ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [caution, setCaution] = useState(initial?.caution ?? '');
  const [examples, setExamples] = useState(initial?.examples ?? '');
  const [tags, setTags] = useState(initial?.tags ?? '');
  const [importance, setImportance] = useState<CommandImportance>(initial?.importance ?? 'medium');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [confluenceUrl, setConfluenceUrl] = useState(initial?.confluenceUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const fid = useId();
  const f = (k: string) => `${fid}-${k}`;

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!command.trim()) {
      setError('command 는 필수입니다.');
      return;
    }
    const payload: CommandEntryCreate = {
      category: category.trim() || undefined,
      command: command.trim(),
      description: description.trim() || undefined,
      caution: caution.trim() || undefined,
      examples: examples.trim() || undefined,
      tags: tags.trim() || undefined,
      importance,
      pinned,
      confluenceUrl: confluenceUrl.trim() || undefined,
    };
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, data: payload });
        toast.success('수정 완료', '명령어 정보가 업데이트되었습니다.');
      } else {
        await create.mutateAsync(payload);
        toast.success('등록 완료', '새 명령어가 추가되었습니다.');
      }
      onClose();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {initial ? '명령어 수정' : '새 명령어 등록'}
          </h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">닫기</button>
        </header>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={f('cat')} className="block text-xs text-muted-foreground mb-1">카테고리</label>
              <input
                id={f('cat')}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="kubectl / helm / docker / linux …"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              />
            </div>
            <div>
              <label htmlFor={f('imp')} className="block text-xs text-muted-foreground mb-1">중요도</label>
              <select
                id={f('imp')}
                value={importance}
                onChange={(e) => setImportance(e.target.value as CommandImportance)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
              >
                {IMPORTANCE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{IMPORTANCE_META[v].label} ({v})</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                상단 고정
              </label>
            </div>
          </div>

          <div>
            <label htmlFor={f('cmd')} className="block text-xs text-muted-foreground mb-1">명령어 *</label>
            <textarea
              id={f('cmd')}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              rows={3}
              placeholder="kubectl drain <node> --ignore-daemonsets --delete-emptydir-data"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl font-mono"
            />
          </div>

          <div>
            <label htmlFor={f('desc')} className="block text-xs text-muted-foreground mb-1">의미</label>
            <textarea
              id={f('desc')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="해당 노드의 모든 워크로드를 다른 노드로 이동시킵니다."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>

          <div>
            <label htmlFor={f('caution')} className="block text-xs text-muted-foreground mb-1">주의사항</label>
            <textarea
              id={f('caution')}
              value={caution}
              onChange={(e) => setCaution(e.target.value)}
              rows={2}
              placeholder="DaemonSet 은 무시되며, 빈 디렉토리 볼륨도 함께 삭제됩니다 — 재기동 전 백업 필요."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>

          <div>
            <label htmlFor={f('ex')} className="block text-xs text-muted-foreground mb-1">예시 (선택)</label>
            <textarea
              id={f('ex')}
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              rows={3}
              placeholder="kubectl drain worker-3 --ignore-daemonsets --delete-emptydir-data"
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono"
            />
          </div>

          <div>
            <label htmlFor={f('tags')} className="block text-xs text-muted-foreground mb-1">태그 (쉼표 구분)</label>
            <input
              id={f('tags')}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="node, maintenance, drain"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl"
            />
          </div>

          <ConfluenceUrlInput
            id={f('confluence')}
            value={confluenceUrl}
            onChange={setConfluenceUrl}
          />

          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-xl bg-secondary text-secondary-foreground"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
          >
            {pending ? '저장 중…' : (initial ? '수정' : '등록')}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────────────────────
export function CommandsPage() {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterImportance, setFilterImportance] = useState<CommandImportance | ''>('');
  const [editing, setEditing] = useState<CommandEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CommandEntry | null>(null);

  const queryParams = useMemo(() => ({
    q: search.trim() || undefined,
    category: filterCategory || undefined,
    importance: filterImportance || undefined,
  }), [search, filterCategory, filterImportance]);

  const { data, isLoading } = useCommands(queryParams);
  const del = useDeleteCommand();

  const entries = useMemo(() => data?.data ?? [], [data]);

  // 카테고리 목록은 등록된 항목들에서 동적으로 추출 — 필터 드롭다운에 사용.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.category) set.add(e.category);
    }
    return Array.from(set).sort();
  }, [entries]);

  return (
    <main className="mx-auto p-5 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Terminal className="w-5 h-5" /> 주요 명령어 / 파라미터 모음
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            자주 쓰는 CLI 한 줄을 의미·주의사항·중요도와 함께 기록. 파괴적 명령은
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-red-500/15 text-red-600 border-red-500/30">
              <AlertTriangle className="w-3 h-3" /> 치명
            </span>
            으로 분류해 시각적으로 구분합니다.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90"
        >
          <Plus className="w-3.5 h-3.5" /> 새 명령어
        </button>
      </div>

      {/* 필터 / 검색 바 */}
      <MacCard bodyPadding="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="명령어 / 의미 / 주의사항 / 태그 검색"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-xl"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-xl"
          >
            <option value="">모든 카테고리</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterImportance}
            onChange={(e) => setFilterImportance(e.target.value as CommandImportance | '')}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-xl"
          >
            <option value="">모든 중요도</option>
            {IMPORTANCE_OPTIONS.map((v) => (
              <option key={v} value={v}>{IMPORTANCE_META[v].label}</option>
            ))}
          </select>
          <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
            {entries.length}건
          </span>
        </div>
      </MacCard>

      {/* 리스트 */}
      <MacCard bodyPadding="p-0">
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-5">로딩 중…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground p-8 text-center">
            등록된 명령어가 없습니다. 우측 상단 [새 명령어] 로 추가하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-[11px] text-muted-foreground">
                  <th className="px-3 py-2 font-medium w-24">중요도</th>
                  <th className="px-3 py-2 font-medium w-24">카테고리</th>
                  <th className="px-3 py-2 font-medium">명령어 / 의미 / 주의사항</th>
                  <th className="px-3 py-2 font-medium w-24 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const meta = IMPORTANCE_META[e.importance] ?? IMPORTANCE_META.medium;
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-border last:border-b-0 hover:bg-muted/10 border-l-4 ${meta.rowAccent}`}
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <ImportanceBadge value={e.importance} />
                          {e.pinned && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                              <Pin className="w-3 h-3" /> 고정
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {e.category ? (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">
                            {e.category}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2">
                            <pre className="flex-1 text-[12px] font-mono bg-background border border-border rounded-lg px-2 py-1.5 whitespace-pre-wrap break-all">
                              {e.command}
                            </pre>
                            <CopyButton value={e.command} />
                          </div>
                          {e.description && (
                            <p className="text-[12px] text-foreground/90">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1.5">의미</span>
                              {e.description}
                            </p>
                          )}
                          {e.caution && (
                            <div className={`text-[12px] rounded-md px-2 py-1.5 border ${meta.badge}`}>
                              <span className="text-[10px] uppercase tracking-wider mr-1.5">주의</span>
                              {e.caution}
                            </div>
                          )}
                          {e.examples && (
                            <details className="text-[11px] text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground select-none">예시 보기</summary>
                              <pre className="mt-1 font-mono bg-muted/20 border border-border rounded p-2 whitespace-pre-wrap">
                                {e.examples}
                              </pre>
                            </details>
                          )}
                          {e.tags && (
                            <div className="flex flex-wrap gap-1">
                              {e.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {e.confluenceUrl && (
                            <a
                              href={e.confluenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors w-fit"
                              title={e.confluenceUrl}
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Confluence
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setEditing(e)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md bg-secondary hover:bg-secondary/80"
                            title="수정"
                          >
                            <Pencil className="w-3 h-3" /> 수정
                          </button>
                          <button
                            onClick={() => setConfirmDelete(e)}
                            className="inline-flex items-center justify-center px-1.5 py-1 text-[11px] rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                            title="삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </MacCard>

      {creating && (
        <FormModal open onClose={() => setCreating(false)} />
      )}
      {editing && (
        <FormModal open initial={editing} onClose={() => setEditing(null)} />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          title="명령어 삭제"
          description={`"${confirmDelete.command.slice(0, 60)}${confirmDelete.command.length > 60 ? '…' : ''}" 항목을 삭제합니다. 계속할까요?`}
          confirmLabel="삭제"
          danger
          onConfirm={async () => {
            await del.mutateAsync(confirmDelete.id);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </main>
  );
}
