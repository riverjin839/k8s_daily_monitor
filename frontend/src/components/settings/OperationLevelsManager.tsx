import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, Layers } from 'lucide-react';
import type { OperationLevelItem } from '@/types';
import { COLOR_OPTIONS, levelBadgeClass, useOperationLevels, useUpdateOperationLevels } from '@/hooks/useOperationLevels';
import { useToast } from '@/components/common';
import { formatApiError } from '@/lib/utils';

function deriveValue(label: string): string {
  return label.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function OperationLevelsManager() {
  const toast = useToast();
  const { data: serverLevels, isLoading } = useOperationLevels();
  const updateMut = useUpdateOperationLevels();

  // 로컬 편집 버퍼 — 저장 전까지 서버에 반영되지 않음
  const [draft, setDraft] = useState<OperationLevelItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [valueTouched, setValueTouched] = useState<Set<number>>(new Set());

  // 서버 데이터 동기화 (저장 후 또는 첫 로드)
  useEffect(() => {
    if (serverLevels && !dirty) {
      setDraft(serverLevels.map((l) => ({ ...l })));
    }
  }, [serverLevels, dirty]);

  const update = (idx: number, patch: Partial<OperationLevelItem>) => {
    setDraft((d) => d.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const remove = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const add = () => {
    setDraft((d) => [...d, { value: '', label: '', color: 'slate' }]);
    setDirty(true);
  };

  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return d;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    // value 자동 채우기
    const seen = new Set<string>();
    const cleaned: OperationLevelItem[] = [];
    for (const l of draft) {
      const label = l.label.trim();
      if (!label) continue;
      const value = (l.value || deriveValue(label)).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      cleaned.push({ value, label, color: l.color || 'slate' });
    }
    try {
      await updateMut.mutateAsync(cleaned);
      toast.success('운영레벨 저장됨', `${cleaned.length}개 항목`);
      setDirty(false);
      setValueTouched(new Set());
    } catch (e) {
      toast.error('저장 실패', formatApiError(e));
    }
  };

  const handleReset = () => {
    if (serverLevels) setDraft(serverLevels.map((l) => ({ ...l })));
    setDirty(false);
    setValueTouched(new Set());
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold">운영레벨 관리</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            클러스터 운영 단계 라벨/색상을 자유롭게 정의합니다. 여기서 정의한 항목은 클러스터 관리 페이지의
            "운영레벨" 컬럼/필터/모달에 즉시 반영됩니다. <strong>value</strong> 는 저장된 식별자(라벨이 비어
            있으면 자동 생성), <strong>label</strong> 은 화면 표시 이름.
          </p>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr className="text-[10px] text-muted-foreground uppercase">
              <th className="px-2 py-1.5 w-8"></th>
              <th className="px-2 py-1.5">표시 라벨</th>
              <th className="px-2 py-1.5">value (식별자)</th>
              <th className="px-2 py-1.5">색상</th>
              <th className="px-2 py-1.5">미리보기</th>
              <th className="px-2 py-1.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> 로딩...
              </td></tr>
            )}
            {!isLoading && draft.map((l, idx) => (
              <tr key={idx} className="border-t border-border align-top">
                <td className="px-1 py-1 text-muted-foreground/60 text-center">
                  <div className="flex flex-col">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="hover:text-foreground disabled:opacity-30 text-[10px] leading-none">▲</button>
                    <button onClick={() => move(idx, 1)} disabled={idx === draft.length - 1}
                      className="hover:text-foreground disabled:opacity-30 text-[10px] leading-none">▼</button>
                  </div>
                </td>
                <td className="px-2 py-1">
                  <input value={l.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    onBlur={() => {
                      // value 가 비어있으면 label 에서 자동 생성 (단, 사용자가 value 를 직접 만진 적 없을 때)
                      if (!l.value && !valueTouched.has(idx) && l.label.trim()) {
                        update(idx, { value: deriveValue(l.label) });
                      }
                    }}
                    placeholder="운영 (Production)"
                    className="w-full px-2 py-1 text-xs bg-background border border-border rounded" />
                </td>
                <td className="px-2 py-1">
                  <input value={l.value}
                    onChange={(e) => { setValueTouched((s) => new Set(s).add(idx)); update(idx, { value: e.target.value }); }}
                    placeholder="production"
                    className="w-full px-2 py-1 text-[11px] font-mono bg-background border border-border rounded" />
                </td>
                <td className="px-2 py-1">
                  <select value={l.color}
                    onChange={(e) => update(idx, { color: e.target.value })}
                    className="w-full px-1 py-1 text-xs bg-background border border-border rounded">
                    {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${levelBadgeClass(l.color)}`}>
                    {l.label || l.value || '?'}
                  </span>
                </td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => remove(idx)}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && draft.length === 0 && (
              <tr><td colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                운영레벨이 비어있습니다. "항목 추가" 로 시작하세요.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg">
          <Plus className="w-3 h-3" /> 항목 추가
        </button>
        <div className="flex items-center gap-2">
          {dirty && (
            <button onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg">
              되돌리기
            </button>
          )}
          <button onClick={handleSave}
            disabled={!dirty || updateMut.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
