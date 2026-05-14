# 장애 로그 분석 — 검색 가능한 ns/pod 선택기 + 스캔 범위 좁히기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `IncidentAnalysisPage` 의 namespace/pod 선택을 검색 가능한 콤보박스로 바꾸고, "이슈 있는 항목만 보기" 토글 시 namespace 선택 또는 ns/pod glob 패턴으로 스캔 범위를 좁혀 큰 클러스터에서도 즉시 사용 가능하게 한다.

**Architecture:** 백엔드 `list_namespaces` 엔드포인트에 `namespace_pattern` / `pod_pattern` CSV glob 파라미터를 추가하고, 프론트엔드에 재사용 가능한 `SearchableSelect` 컴포넌트를 신설해 native `<select>` 를 교체한다. UI 는 "ns 선택 + 토글 ON" 시 클러스터 전체 스캔을 회피하도록 effective 플래그를 계산한다.

**Tech Stack:** FastAPI · Python 3.11 · kubernetes SDK · pytest / React 18 · TypeScript 5.3 · TanStack Query 5 · Tailwind · Vite

**Spec:** `docs/superpowers/specs/2026-05-13-incident-search-scope-design.md`

---

## Task 1: 백엔드 — `_matches_csv_glob` 헬퍼 + 단위 테스트

**Files:**
- Create: `backend/tests/test_csv_glob.py`
- Modify: `backend/app/routers/analyze.py` (top of file, helpers section)

- [ ] **Step 1: 실패 테스트 작성**

`backend/tests/test_csv_glob.py` 신규:

```python
"""Unit tests for _matches_csv_glob helper used by /analyze namespace filtering."""
from app.routers.analyze import _matches_csv_glob


def test_matches_csv_glob_empty_passes_through():
    assert _matches_csv_glob("anything", "")
    assert _matches_csv_glob("anything", "   ")


def test_matches_csv_glob_exact_name():
    assert _matches_csv_glob("monitoring", "monitoring")
    assert not _matches_csv_glob("monitoring2", "monitoring")


def test_matches_csv_glob_wildcard_star():
    assert _matches_csv_glob("kube-system", "kube-*")
    assert _matches_csv_glob("kube-public", "kube-*")
    assert not _matches_csv_glob("default", "kube-*")


def test_matches_csv_glob_wildcard_question_mark():
    assert _matches_csv_glob("ns1", "ns?")
    assert _matches_csv_glob("nsa", "ns?")
    assert not _matches_csv_glob("ns12", "ns?")


def test_matches_csv_glob_csv_or_logic():
    assert _matches_csv_glob("monitoring", "kube-*,monitoring,argocd")
    assert _matches_csv_glob("argocd", "kube-*,monitoring,argocd")
    assert _matches_csv_glob("kube-system", "kube-*,monitoring,argocd")
    assert not _matches_csv_glob("istio-system", "kube-*,monitoring,argocd")


def test_matches_csv_glob_ignores_whitespace_in_patterns():
    assert _matches_csv_glob("monitoring", " kube-* , monitoring , argocd ")


def test_matches_csv_glob_ignores_empty_segments():
    # 빈 세그먼트(연속 콤마)는 무시되어야 함 — 빈 패턴이 모든 것을 매치하면 안 됨
    assert _matches_csv_glob("monitoring", "kube-*,,monitoring")
    assert not _matches_csv_glob("default", ",,,")
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd backend
pytest tests/test_csv_glob.py -v
```

Expected: `ImportError: cannot import name '_matches_csv_glob' from 'app.routers.analyze'` 또는 모든 테스트가 ImportError 로 실패.

- [ ] **Step 3: 헬퍼 구현**

`backend/app/routers/analyze.py` 상단의 `import` 블록에 `fnmatch` 추가:

```python
import fnmatch
import logging
import os
```

그리고 `# ── helpers ─────────────────────────────────────────────────────────` 섹션 (line 496 근처) 의 `_BAD_WAITING_REASONS` 정의 **바로 위에** 헬퍼 추가:

```python
def _matches_csv_glob(name: str, csv_glob: str) -> bool:
    """CSV 로 구분된 glob 패턴 중 하나라도 매치하면 True.

    빈 문자열(공백만 포함 포함) 이면 "필터 없음" 으로 간주해 True 반환.
    빈 세그먼트(연속 콤마)는 무시 — 그 자체로 모든 것을 매치하지 않음.

    예:
        _matches_csv_glob("kube-system", "kube-*,monitoring") -> True
        _matches_csv_glob("default",     "kube-*,monitoring") -> False
        _matches_csv_glob("anything",    "")                  -> True
    """
    if not csv_glob.strip():
        return True
    for pat in csv_glob.split(","):
        pat = pat.strip()
        if pat and fnmatch.fnmatch(name, pat):
            return True
    return False
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

```bash
cd backend
pytest tests/test_csv_glob.py -v
```

Expected: 7 passed.

- [ ] **Step 5: 커밋**

```bash
git add backend/tests/test_csv_glob.py backend/app/routers/analyze.py
git commit -m "feat(analyze): add _matches_csv_glob helper for ns/pod pattern filtering"
```

---

## Task 2: 백엔드 — `list_namespaces` 에 패턴 파라미터 추가

**Files:**
- Modify: `backend/app/routers/analyze.py:233-321` (`list_namespaces` 함수 전체)

- [ ] **Step 1: 시그니처 + 필터링 로직 수정**

`backend/app/routers/analyze.py` 의 `list_namespaces` 함수를 다음과 같이 교체. 기존 함수 본문 (line 233 ~ 321) 을 통째로 대체:

```python
@router.get("/clusters/{cluster_id}/namespaces", response_model=NamespacesResponse)
def list_namespaces(
    cluster_id: UUID,
    only_with_issues: bool = False,
    with_counts: bool = False,
    namespace_pattern: str = "",
    pod_pattern: str = "",
    db: Session = Depends(get_db),
):
    """장애 분석 UI 의 namespace 드롭다운용.

    **빠른 경로 (기본)**: pod 목록을 가져오지 않고 ns 이름만 반환 → 거대 클러스터에서도
    즉시 응답. ``pod_count`` / ``has_unhealthy`` 는 모두 None / False.

    **느린 경로 (opt-in)**:
      - ``only_with_issues=true`` → 비정상 pod 가 있는 ns 만 (필터)
      - ``with_counts=true``      → 각 ns 의 pod 수 + 이상 여부 표기
    둘 중 하나라도 켜지면 pod fetch 가 발동된다. 이 때 비용을 줄이기 위해:

      - ``namespace_pattern`` (CSV glob, 예: "kube-*,monitoring") 이 주어지면 ns 페이지네이션
        fetch 직후 인메모리에서 1차 필터 → pod fetch 대상 ns 가 줄어든다.
      - 필터 후 ns 가 50개 이하면 ns 별 ``list_namespaced_pod`` 를 순차 호출해 클러스터
        전체 pod (수만~수십만 개) fetch 를 피한다. 50개 초과면 기존처럼
        ``list_pod_for_all_namespaces`` 한 방으로 가져온 뒤 인메모리 필터.
      - ``pod_pattern`` 이 주어지면 pod 순회 중에 매칭되는 pod 만 ``_is_pod_unhealthy``
        평가 대상이 된다.

    namespace 자체도 페이지네이션(_continue) 으로 가져와 ns 가 1만개여도 견딘다.
    """
    cluster = _require_cluster(cluster_id, db)
    v1 = _get_core_v1(cluster)

    # 1) namespace 페이지네이션 fetch
    try:
        ns_items = []
        token: str | None = None
        # 안전 상한 — ns 가 5만개 같은 비현실적인 케이스 방어.
        for _ in range(200):
            kwargs: dict = {"_request_timeout": _K8S_NS_LIST_TIMEOUT, "limit": _K8S_LIST_PAGE}
            if token:
                kwargs["_continue"] = token
            page = v1.list_namespace(**kwargs)
            ns_items.extend(page.items)
            token = (page.metadata._continue or None) if page.metadata else None
            if not token:
                break
    except Exception as e:
        msg = str(e)[:200]
        is_timeout = "timeout" in msg.lower() or "timed out" in msg.lower()
        raise HTTPException(
            status_code=504 if is_timeout else 502,
            detail=f"namespace 조회 실패: {msg}",
        ) from e

    # 1.5) namespace_pattern 으로 1차 필터 — pod fetch 비용 절감.
    if namespace_pattern.strip():
        ns_items = [
            ns for ns in ns_items
            if _matches_csv_glob(ns.metadata.name, namespace_pattern)
        ]

    counts: dict[str, int] = {}
    unhealthy: dict[str, bool] = {}

    # 2) pod fetch — 사용자가 명시적으로 요구할 때만.
    if (only_with_issues or with_counts) and ns_items:
        # 필터 후 ns 가 적게 남았으면 ns 별 순차 fetch (큰 클러스터에서 압도적으로 빠름).
        target_ns_names = {ns.metadata.name for ns in ns_items}
        use_per_ns = len(target_ns_names) <= 50

        def _consume_pod(p) -> None:
            ns_name = p.metadata.namespace
            if ns_name not in target_ns_names:
                return
            if pod_pattern.strip() and not _matches_csv_glob(p.metadata.name, pod_pattern):
                return
            if with_counts:
                counts[ns_name] = counts.get(ns_name, 0) + 1
            if _is_pod_unhealthy(p):
                unhealthy[ns_name] = True

        try:
            if use_per_ns:
                for ns_name in target_ns_names:
                    pod_token: str | None = None
                    for _ in range(200):
                        kwargs = {
                            "_request_timeout": _K8S_POD_LIST_TIMEOUT,
                            "limit": _K8S_POD_LIST_PAGE,
                        }
                        if pod_token:
                            kwargs["_continue"] = pod_token
                        page = v1.list_namespaced_pod(ns_name, **kwargs)
                        for p in page.items:
                            _consume_pod(p)
                        pod_token = (page.metadata._continue or None) if page.metadata else None
                        if not pod_token:
                            break
            else:
                pod_token = None
                for _ in range(200):
                    kwargs = {
                        "_request_timeout": _K8S_POD_LIST_TIMEOUT,
                        "limit": _K8S_POD_LIST_PAGE,
                    }
                    if pod_token:
                        kwargs["_continue"] = pod_token
                    page = v1.list_pod_for_all_namespaces(**kwargs)
                    for p in page.items:
                        _consume_pod(p)
                    pod_token = (page.metadata._continue or None) if page.metadata else None
                    if not pod_token:
                        break
        except Exception as e:
            # pod 조회 실패는 경고만 — namespace 리스트 자체는 반환.
            logger.warning("pod list 실패 (counts/unhealthy 미반영): %s", str(e)[:200])

    items: list[NamespaceItem] = []
    for ns in ns_items:
        name = ns.metadata.name
        item = NamespaceItem(
            name=name,
            pod_count=counts.get(name) if with_counts else None,
            has_unhealthy=unhealthy.get(name, False),
        )
        if only_with_issues and not item.has_unhealthy:
            continue
        items.append(item)

    # 비정상 ns 를 위로
    items.sort(key=lambda i: (not i.has_unhealthy, i.name))

    return NamespacesResponse(
        cluster_id=cluster_id, cluster_name=cluster.name, namespaces=items,
    )
```

- [ ] **Step 2: 기존 테스트가 깨지지 않는지 확인**

```bash
cd backend
pytest -v
```

Expected: 모든 테스트 통과 (test_csv_glob 7개 포함). `list_namespaces` 엔드포인트 자체는 k8s 의존이라 단위 테스트 없음.

- [ ] **Step 3: OpenAPI 스키마에 새 파라미터가 반영됐는지 확인**

```bash
cd backend
python -c "from app.main import app; import json; \
  paths = app.openapi()['paths']; \
  params = paths['/api/v1/analyze/clusters/{cluster_id}/namespaces']['get']['parameters']; \
  names = [p['name'] for p in params]; \
  assert 'namespace_pattern' in names, names; \
  assert 'pod_pattern' in names, names; \
  print('OK:', names)"
```

Expected: `OK: ['cluster_id', 'only_with_issues', 'with_counts', 'namespace_pattern', 'pod_pattern']` (순서 무관).

- [ ] **Step 4: 커밋**

```bash
git add backend/app/routers/analyze.py
git commit -m "feat(analyze): namespace/pod glob 패턴으로 이슈 스캔 범위 좁히기"
```

---

## Task 3: 프론트엔드 — SearchableSelect 컴포넌트 신설

**Files:**
- Create: `frontend/src/components/common/SearchableSelect.tsx`
- Modify: `frontend/src/components/common/index.ts`

- [ ] **Step 1: SearchableSelect 컴포넌트 작성**

`frontend/src/components/common/SearchableSelect.tsx` 신규:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';

interface SearchableSelectProps<T> {
  value: string;
  onChange: (key: string) => void;
  options: T[];
  getKey: (o: T) => string;
  getLabel: (o: T) => string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  clearable?: boolean;
  className?: string;
  id?: string;
}

/** 단일 선택 검색 가능 콤보박스.
 *
 *  - Input 클릭/focus 시 dropdown 열림
 *  - 타이핑 → label 에 대해 case-insensitive includes 필터
 *  - ↑/↓ navigate, Enter 선택, Esc 닫기
 *  - IME 조합 중 Enter 는 무시 (한글 입력 안전)
 *  - max-h-72 + overflow-auto, 가상 스크롤 없음
 */
export function SearchableSelect<T>({
  value,
  onChange,
  options,
  getKey,
  getLabel,
  placeholder = '검색...',
  disabled = false,
  loading = false,
  emptyText = '항목 없음',
  clearable = true,
  className = '',
  id,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [composing, setComposing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => getKey(o) === value),
    [options, value, getKey],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => getLabel(o).toLowerCase().includes(q));
  }, [options, query, getLabel]);

  // open 상태 변화 시 highlight 초기화
  useEffect(() => {
    if (open) setHighlight(0);
  }, [open, query]);

  // click outside → 닫기
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // highlight 변경 시 항목이 보이게 스크롤
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const select = (opt: T) => {
    onChange(getKey(opt));
    setOpen(false);
    setQuery('');
  };

  const clear = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const display = open ? query : (selected ? getLabel(selected) : '');

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={display}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (composing) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && filtered[highlight]) select(filtered[highlight]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
            } else if (e.key === 'Tab') {
              setOpen(false);
              setQuery('');
            }
          }}
          className="w-full pl-8 pr-16 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {clearable && value && !disabled && (
            <button
              type="button"
              onClick={clear}
              aria-label="선택 지우기"
              className="p-1 text-muted-foreground hover:text-foreground rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {open && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-border bg-card shadow-lg py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground italic">
              {options.length === 0 ? emptyText : '검색 결과 없음'}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const key = getKey(opt);
              const isSelected = key === value;
              const isHighlighted = i === highlight;
              return (
                <li
                  key={key}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`px-3 py-1.5 text-sm cursor-pointer truncate
                    ${isHighlighted ? 'bg-primary/10 text-foreground' : 'text-foreground'}
                    ${isSelected ? 'font-medium' : ''}
                  `}
                >
                  {getLabel(opt)}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: barrel export 추가**

`frontend/src/components/common/index.ts` 끝에 한 줄 추가:

```ts
export { SearchableSelect } from './SearchableSelect';
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: 0 error, 0 warning.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/common/SearchableSelect.tsx frontend/src/components/common/index.ts
git commit -m "feat(common): SearchableSelect 단일 선택 검색 콤보박스 컴포넌트 추가"
```

---

## Task 4: 프론트엔드 — API 서비스 + 훅 시그니처 확장

**Files:**
- Modify: `frontend/src/services/api.ts:1015-1023` (`analyzeApi.listNamespaces`)
- Modify: `frontend/src/hooks/useIncidentAnalysis.ts:21-40` (`useAnalyzeNamespaces`)

- [ ] **Step 1: `api.ts` 의 `listNamespaces` 시그니처 확장**

`frontend/src/services/api.ts` 의 `listNamespaces` 함수 (line 1015-1023) 를 다음으로 교체:

```ts
  listNamespaces: (
    clusterId: string,
    onlyWithIssues = false,
    withCounts = false,
    namespacePattern = '',
    podPattern = '',
  ) =>
    api.get<import('@/types').AnalyzeNamespacesResponse>(
      `/analyze/clusters/${clusterId}/namespaces`,
      {
        params: {
          only_with_issues: onlyWithIssues,
          with_counts: withCounts,
          namespace_pattern: namespacePattern,
          pod_pattern: podPattern,
        },
        // 거대 클러스터에서 with_counts/only_with_issues 일 때만 무거우므로 그 경우만 긴 타임아웃.
        timeout: (onlyWithIssues || withCounts) ? 150_000 : 30_000,
      },
    ),
```

> 참고: axios 의 request interceptor 가 이미 camelCase→snake_case 변환을 수행하지만, `params` 객체에는 적용되지 않는다 (interceptor 가 body 만 처리). 따라서 명시적으로 snake_case 키를 사용한다 (기존 `only_with_issues` 처럼).

- [ ] **Step 2: `useIncidentAnalysis.ts` 에 debounce 헬퍼 + `useAnalyzeNamespaces` 확장**

`frontend/src/hooks/useIncidentAnalysis.ts` 의 import 라인 위에 `useEffect`, `useState` 도 추가하고, 파일 전체를 다음으로 교체:

```ts
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { analyzeApi } from '@/services/api';
import type { IncidentAnalysisRequest } from '@/types';

/** 값이 N ms 동안 안정되면 그 시점의 값을 반환. 타이핑 중 매 키 입력마다
 *  refetch 가 발생하지 않게 하기 위함. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useAnalyzerHealth() {
  return useQuery({
    queryKey: ['analyzer', 'health'],
    queryFn: () => analyzeApi.health().then((r) => r.data),
    staleTime: 1000 * 60,
    retry: false,
  });
}

export function useAnalyzeIncident() {
  return useMutation({
    mutationFn: (context: IncidentAnalysisRequest) =>
      analyzeApi.analyze(context).then((r) => r.data),
  });
}

/** 선택된 클러스터의 namespace 드롭다운 데이터.
 *
 *  큰 클러스터 대비 — 기본은 fast path (백엔드 with_counts=false) 로 ns 이름만 빠르게.
 *  ``onlyWithIssues=true`` 거나 ``withCounts=true`` 일 때만 클러스터 전체 pod fetch
 *  (느린 경로) 가 발동된다. ``namespacePattern`` / ``podPattern`` 으로 그 비용을 좁힐 수 있다.
 *
 *  패턴 값은 300ms 동안 안정된 뒤에야 queryKey 에 반영 — 타이핑 중 refetch 폭주 방지. */
export function useAnalyzeNamespaces(
  clusterId: string,
  onlyWithIssues = false,
  withCounts = false,
  namespacePattern = '',
  podPattern = '',
) {
  const dNsPattern  = useDebouncedValue(namespacePattern, 300);
  const dPodPattern = useDebouncedValue(podPattern, 300);
  return useQuery({
    queryKey: ['analyzer', 'namespaces', clusterId, onlyWithIssues, withCounts, dNsPattern, dPodPattern],
    queryFn: () =>
      analyzeApi
        .listNamespaces(clusterId, onlyWithIssues, withCounts, dNsPattern, dPodPattern)
        .then((r) => r.data),
    enabled: !!clusterId,
    staleTime: 1000 * 30,
  });
}

/** 선택된 namespace 의 pod 리스트. */
export function useAnalyzePods(
  clusterId: string,
  namespace: string,
  onlyWithIssues = false,
) {
  return useQuery({
    queryKey: ['analyzer', 'pods', clusterId, namespace, onlyWithIssues],
    queryFn: () =>
      analyzeApi.listPods(clusterId, namespace, onlyWithIssues).then((r) => r.data),
    enabled: !!clusterId && !!namespace,
    staleTime: 1000 * 15,
  });
}

/** 선택된 pod 의 logs/events/describe 를 한 번에 가져오는 mutation 형태(트리거 버튼용). */
export function useFetchIncidentContext() {
  return useMutation({
    mutationFn: (vars: {
      clusterId: string;
      namespace: string;
      podName: string;
      tailLines?: number;
    }) =>
      analyzeApi
        .fetchContext(vars.clusterId, vars.namespace, vars.podName, vars.tailLines ?? 200)
        .then((r) => r.data),
  });
}
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: 0 error, 0 warning. (이 시점에서 `useAnalyzeNamespaces` 의 호출처는 아직 옛 시그니처를 쓰지만, 추가 파라미터에 기본값이 있어 호환됨.)

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/services/api.ts frontend/src/hooks/useIncidentAnalysis.ts
git commit -m "feat(analyze): listNamespaces 시그니처에 ns/pod 패턴 + 300ms debounce 추가"
```

---

## Task 5: 프론트엔드 — `IncidentAnalysisPage` UI 변경

**Files:**
- Modify: `frontend/src/pages/IncidentAnalysisPage.tsx` ("대상 선택" 패널 부분 — 약 line 122-471)

- [ ] **Step 1: import 정리**

파일 상단의 lucide-react import 라인을 다음으로 교체 (line 2-5):

```tsx
import {
  AlertTriangle, CheckCircle, Info, Loader2, Search, Zap,
  Server, Layers, Package, RefreshCw, Download, Play, Square, Filter, X,
} from 'lucide-react';
import { SearchableSelect } from '@/components/common';
```

> `SearchableSelect` 내부에 Search 아이콘이 들어 있으므로 페이지의 다른 곳에서 Search 가 여전히 쓰이는지 확인. (분석 시작 버튼에서 사용 중이므로 그대로 둠.)

- [ ] **Step 2: 패턴 state 추가**

`IncidentAnalysisPage` 함수 본문에서 `onlyIssues` state 정의 (line 138) **바로 아래에** 두 줄 추가:

```tsx
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [nsPattern, setNsPattern] = useState('');
  const [podPattern, setPodPattern] = useState('');
```

- [ ] **Step 3: `useAnalyzeNamespaces` 호출 변경**

기존 (line 144):

```tsx
  const nsQ   = useAnalyzeNamespaces(clusterId, onlyIssues);
```

을 다음으로 교체:

```tsx
  // ns 가 이미 선택돼 있으면 클러스터 전체 스캔은 불필요 — pod 쿼리에서만 onlyIssues 적용.
  const effectiveOnlyIssues = onlyIssues && !namespace;
  const nsQ = useAnalyzeNamespaces(
    clusterId, effectiveOnlyIssues, false, nsPattern, podPattern,
  );
```

- [ ] **Step 4: "이슈 토글 + 패턴 입력" UI 블록 교체**

기존 토글 단독 줄 (line 324-338) 을 다음 블록으로 교체:

```tsx
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              대상 선택
            </p>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"
              title="OFF: namespace 이름만 빠르게 조회 (큰 클러스터 권장). ON: 클러스터 전체 pod 를 스캔해 비정상 ns/pod 만 추림 (느림 — 큰 클러스터에서 1분 이상 소요 가능). ns 가 이미 선택돼 있으면 그 ns 만 스캔.">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
                className="w-3.5 h-3.5 accent-primary"
              />
              이슈 있는 항목만 보기 (느림)
            </label>
          </div>

          {/* 이슈만 + ns 미선택일 때 — glob 패턴으로 스캔 범위 좁히기 */}
          {onlyIssues && !namespace && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label htmlFor={f('nsPattern')} className={lc}>
                    Namespace 패턴 (선택)
                  </label>
                  <input
                    id={f('nsPattern')}
                    value={nsPattern}
                    onChange={(e) => setNsPattern(e.target.value)}
                    placeholder="kube-*,monitoring,argocd"
                    className={`${ic} font-mono text-xs`}
                  />
                </div>
                <div>
                  <label htmlFor={f('podPattern')} className={lc}>
                    Pod 이름 패턴 (선택)
                  </label>
                  <input
                    id={f('podPattern')}
                    value={podPattern}
                    onChange={(e) => setPodPattern(e.target.value)}
                    placeholder="*nginx*,*api*"
                    className={`${ic} font-mono text-xs`}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                💡 콤마 구분, <code>*</code> <code>?</code> 와일드카드. 비워두면 전체 ns 스캔.
                Namespace 를 선택하면 이 입력은 사라지고 그 ns 만 스캔합니다.
              </p>
            </div>
          )}
```

- [ ] **Step 5: namespace `<select>` 를 SearchableSelect 로 교체**

기존 namespace `<div>` 블록 (line 361-391) 을 다음으로 교체:

```tsx
            {/* Namespace */}
            <div>
              <label className={lc}>
                <Layers className="w-3 h-3 inline mr-1" />
                Namespace
                {nsQ.isLoading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
                {nsQ.data && (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({nsQ.data.namespaces.length})
                  </span>
                )}
              </label>
              <SearchableSelect
                value={namespace}
                onChange={setNamespace}
                options={nsQ.data?.namespaces ?? []}
                getKey={(n) => n.name}
                getLabel={(n) =>
                  `${n.hasUnhealthy ? '⚠ ' : ''}${n.name}` +
                  (typeof n.podCount === 'number' ? ` (${n.podCount} pods)` : '')
                }
                placeholder="namespace 검색..."
                disabled={!clusterId || nsQ.isLoading}
                loading={nsQ.isLoading}
                emptyText="namespace 없음"
              />
              {nsQ.isError && (
                <p className="text-[11px] text-red-400 mt-1">
                  {formatApiError(nsQ.error)}
                </p>
              )}
            </div>
```

- [ ] **Step 6: pod `<select>` 를 SearchableSelect 로 교체**

기존 pod `<div>` 블록 (line 393-423) 을 다음으로 교체:

```tsx
            {/* Pod */}
            <div>
              <label className={lc}>
                <Package className="w-3 h-3 inline mr-1" />
                Pod
                {podsQ.isLoading && <Loader2 className="w-3 h-3 inline ml-1 animate-spin" />}
                {podsQ.data && (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({podsQ.data.pods.length})
                  </span>
                )}
              </label>
              <SearchableSelect
                value={podName}
                onChange={setPodName}
                options={podsQ.data?.pods ?? []}
                getKey={(p) => p.name}
                getLabel={podOptionLabel}
                placeholder="pod 검색..."
                disabled={!namespace || podsQ.isLoading}
                loading={podsQ.isLoading}
                emptyText="pod 없음"
                className="font-mono text-xs"
              />
              {podsQ.isError && (
                <p className="text-[11px] text-red-400 mt-1">
                  {formatApiError(podsQ.error)}
                </p>
              )}
            </div>
```

- [ ] **Step 7: 타입 체크 + 린트 + 빌드**

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

Expected: 0 error, 0 warning, build 성공.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/pages/IncidentAnalysisPage.tsx
git commit -m "feat(incident-analysis): ns/pod 검색 가능 선택기 + 스캔 범위 패턴 입력"
```

---

## Task 6: 수동 검증 (kind 로컬 클러스터)

이 단계는 코드 변경이 없습니다. 구현이 끝난 뒤 실제 동작을 확인합니다.

- [ ] **Step 1: 로컬 환경 기동**

```bash
docker-compose up -d
```

브라우저: http://localhost:5173/incident-analysis (또는 사이드바에서 "장애 로그 자동 요약" 메뉴 클릭).

- [ ] **Step 2: 시나리오 1 — 기본 fast path**

- 클러스터 선택
- "이슈 있는 항목만 보기" OFF
- **확인**: namespace 리스트가 즉시 표시됨. Network 탭에서 `/analyze/clusters/.../namespaces?only_with_issues=false&with_counts=false&namespace_pattern=&pod_pattern=` 호출.

- [ ] **Step 3: 시나리오 2 — cluster-wide scan (기존 동작 유지)**

- ns 클리어 (✕ 버튼)
- "이슈 있는 항목만 보기" ON, 패턴 두 칸 비워둠
- **확인**: 1~수십 초 후 비정상 ns 만 표시. 패턴 입력 박스가 amber 배경으로 보임.

- [ ] **Step 4: 시나리오 3 — namespace 패턴 적용**

- "이슈만" ON 유지, Namespace 패턴 칸에 `kube-*` 입력
- **확인**: 300ms 후 자동 refetch. kube-* 만 결과. Network 탭에서 `namespace_pattern=kube-*` 확인.

- [ ] **Step 5: 시나리오 4 — pod 패턴까지 적용**

- Pod 이름 패턴에 `*coredns*` 추가
- **확인**: coredns 가 비정상이면 그 ns 만 결과, 아니면 빈 결과.

- [ ] **Step 6: 시나리오 5 — ns 선택 시 cluster scan 회피**

- Namespace SearchableSelect 에서 특정 ns 선택 (예: `kube-system`)
- 패턴 입력 박스가 사라지는지 확인
- **확인**: Network 탭에서 새로 발생한 `/namespaces` 호출이 `only_with_issues=false` 인지 확인 (cluster-wide scan 안 일어남). pod 쿼리만 `only_with_issues=true`.

- [ ] **Step 7: 시나리오 6 — SearchableSelect 동작**

- Namespace 검색창에 타이핑 → dropdown 이 즉시 좁혀짐
- ↑/↓ 키로 highlight 이동, Enter 로 선택, Esc 로 닫기
- ✕ 버튼으로 선택 해제 → 패턴 박스 다시 보임
- 한글 IME 로 무언가 입력 시도 → 옵션은 영문이라 결과 없음 표시, Enter 가 잘못 선택하지 않음

- [ ] **Step 8: 검증 결과 PR 본문에 기록**

수동 검증이 모두 통과하면 PR 본문 (한국어 + Markdown) 의 "테스트" 섹션에 시나리오 1~6 체크리스트를 그대로 옮긴다.

---

## 자체 검토 결과

**Spec coverage:**
- §1 변경 범위 → Task 1~5 에서 모든 파일 변경 커버 ✓
- §2 SearchableSelect → Task 3 ✓
- §3 백엔드 패턴 + 헬퍼 → Task 1, 2 ✓
- §4 UI 변경 (상태/훅/표시 조건) → Task 5 Step 2~4 ✓
- §5 경계 케이스 → SearchableSelect emptyText, ImE compose, effectiveOnlyIssues 가드, debounce 모두 Task 3·4·5 에 포함 ✓
- §6 수동 검증 시나리오 → Task 6 ✓

**Placeholder scan:** TBD/TODO 없음. 모든 코드 블록이 완전한 형태로 포함됨.

**Type consistency:** `SearchableSelectProps` 의 `getKey`/`getLabel` 시그니처가 Task 5 의 namespace (`NamespaceItem`) / pod (`PodItem`) 사용처와 일치. `useDebouncedValue` 가 Task 4 에서 정의되고 같은 파일 내에서만 호출됨 — export 충돌 없음. `nsPattern`/`podPattern` snake_case 변환은 Task 4 Step 1 의 명시적 params 키로 처리.
