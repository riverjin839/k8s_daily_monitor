# 장애 로그 분석 — 검색 가능한 ns/pod 선택기 + 스캔 범위 좁히기

- **작성일**: 2026-05-13
- **대상 페이지**: `frontend/src/pages/IncidentAnalysisPage.tsx` (URL: `/incident-analysis`, 사용자 명칭 "K8s 서비스 로그분석")
- **요청자 의도**:
  1. namespace / pod 드롭다운에 **서치바** 를 추가해 수천 개 옵션에서도 즉시 찾기.
  2. "이슈 있는 항목만 보기" 토글 시 **클러스터 전체 스캔이 아닌, namespace + pod 범위로 좁혀** 스캔할 수 있게 한다.

---

## 1. 변경 범위

| 파일 | 변경 |
|---|---|
| `frontend/src/components/common/SearchableSelect.tsx` | 신규 — 검색 가능한 단일 선택 콤보박스 |
| `frontend/src/pages/IncidentAnalysisPage.tsx` | "대상 선택" 패널 — `<select>` → SearchableSelect 교체, ns/pod 패턴 입력 추가 |
| `frontend/src/services/api.ts` | `listNamespaces` 시그니처에 `nsPattern`, `podPattern` 추가 |
| `frontend/src/hooks/useIncidentAnalysis.ts` | `useAnalyzeNamespaces` 시그니처 확장 + 300ms debounce |
| `backend/app/routers/analyze.py` | `list_namespaces` 에 `namespace_pattern`, `pod_pattern` 쿼리 파라미터 + `_matches_csv_glob` 헬퍼 |
| `backend/tests/test_analyze.py` (또는 기존 테스트에 추가) | `_matches_csv_glob` 단위 테스트 |

**변경 없음**: `/analyze/incident`, `/analyze/clusters/{id}/namespaces/{ns}/pods`, `/analyze/clusters/{id}/namespaces/{ns}/pods/{name}/context`, 분석 결과 패널, 자동 채우기, 로그 라인 필터, 실시간 스트리밍.

---

## 2. SearchableSelect 컴포넌트 (신규)

`frontend/src/components/common/SearchableSelect.tsx` — namespace, pod 두 곳에서 재사용.

### Props

```ts
interface SearchableSelectProps<T> {
  value: string;
  onChange: (key: string) => void;
  options: T[];
  getKey: (o: T) => string;
  getLabel: (o: T) => string;     // ⚠ 같은 prefix 포함 가능
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyText?: string;
  clearable?: boolean;            // 기본 true
}
```

### 동작

- Input 클릭 / focus → dropdown 열림, 전체 옵션 노출
- 타이핑 → `getLabel().toLowerCase().includes(query.toLowerCase())` 로 필터링
- 키보드: ↑/↓ navigate, Enter 선택, Esc 닫기, Tab 닫기
- Click-outside (`mousedown` listener + `useRef`) → 닫기
- IME 조합 중 Enter 는 무시 (`compositionstart`/`end`)
- 단일 선택만 지원 (현재 페이지 요구사항)
- 가상 스크롤 없음 — `max-h-72 overflow-auto` 로 충분, 입력 검색으로 좁혀짐
- Disabled 시 input readonly, dropdown 안 열림
- Loading 시 input 옆에 `Loader2` 스피너 (기존 페이지 패턴과 동일)

### 위치

페이지 전역이 아니라 폼 내부에서 쓰는 일반 컴포넌트이므로 `components/common/` 에 둠. `components/common/index.ts` 에 barrel export 추가.

---

## 3. 백엔드 — `GET /analyze/clusters/{id}/namespaces` 확장

### 시그니처

```python
list_namespaces(
    cluster_id: UUID,
    only_with_issues: bool = False,
    with_counts: bool = False,
    namespace_pattern: str = "",   # CSV glob, 예: "kube-*,monitoring,argocd"
    pod_pattern: str = "",         # CSV glob, 예: "*nginx*,*api*"
)
```

기본값이 빈 문자열이라 기존 클라이언트 호출은 **완전히 호환**.

### 헬퍼

```python
import fnmatch

def _matches_csv_glob(name: str, csv_glob: str) -> bool:
    """빈 문자열이면 True (필터 없음). CSV 로 구분된 glob 중 하나라도 매치하면 True."""
    if not csv_glob.strip():
        return True
    for pat in csv_glob.split(","):
        pat = pat.strip()
        if pat and fnmatch.fnmatch(name, pat):
            return True
    return False
```

### 적용 순서

1. ns 페이지네이션 fetch (기존과 동일).
2. `namespace_pattern` 있으면 그 시점에 ns 리스트를 `_matches_csv_glob` 로 1차 필터 → `ns_items` 가 줄어듦.
3. `only_with_issues` 또는 `with_counts` 가 True 이고 `len(ns_items) > 0` 일 때만 pod fetch.
   - `len(ns_items) <= 50` 이면 ns 별 `list_namespaced_pod` 순차 호출 (필요한 ns 만).
   - 50 초과면 기존처럼 `list_pod_for_all_namespaces` 호출 후 인메모리에서 `ns_items` 멤버십 + `pod_pattern` 필터.
4. pod 순회 중 `pod_pattern` 있으면 `_matches_csv_glob(p.metadata.name, pod_pattern)` 으로 거른 뒤 `_is_pod_unhealthy` 평가.
5. `only_with_issues=True` 면 `unhealthy[ns]` 없는 ns 솎아내고 응답.

`pod_pattern` 은 `only_with_issues=True` 케이스에서만 의미가 있음 (이 엔드포인트는 ns 리스트만 반환). UI 도 그 조건에서만 입력 노출.

### 검증

`backend/tests/` 에 `_matches_csv_glob` 단위 테스트:

```python
def test_matches_csv_glob_empty_passes_through():
    assert _matches_csv_glob("anything", "")
    assert _matches_csv_glob("anything", "   ")

def test_matches_csv_glob_wildcard():
    assert _matches_csv_glob("kube-system", "kube-*")
    assert _matches_csv_glob("kube-public", "kube-*")
    assert not _matches_csv_glob("default", "kube-*")

def test_matches_csv_glob_csv_or():
    assert _matches_csv_glob("monitoring", "kube-*,monitoring,argocd")
    assert _matches_csv_glob("argocd", "kube-*,monitoring,argocd")
    assert not _matches_csv_glob("istio-system", "kube-*,monitoring,argocd")

def test_matches_csv_glob_question_mark():
    assert _matches_csv_glob("ns1", "ns?")
    assert not _matches_csv_glob("ns12", "ns?")
```

엔드포인트 자체는 k8s 클라이언트 의존이라 단위 테스트 없이 수동 검증 (kind 로컬).

---

## 4. 프론트엔드 — `IncidentAnalysisPage.tsx`

### 4.1 상태 변수 (추가)

```tsx
const [nsPattern, setNsPattern]   = useState('');
const [podPattern, setPodPattern] = useState('');
```

### 4.2 훅 호출

```tsx
const effectiveOnlyIssues = onlyIssues && !namespace;  // ns 미선택일 때만 cluster-wide scan
const nsQ = useAnalyzeNamespaces(
  clusterId, effectiveOnlyIssues, false, nsPattern, podPattern,
);
const podsQ = useAnalyzePods(clusterId, namespace, onlyIssues);
```

`useAnalyzeNamespaces` 내부에 300ms debounce — 타이핑 중 매 키 입력 refetch 방지. `useMemo` 로 디바운스된 패턴을 queryKey 에 반영.

### 4.3 UI 변경

```
┌─ 대상 선택 ───────────────────────────────────────────────────────┐
│                                ☑ 이슈 있는 항목만 보기 (느림)     │
│                                                                   │
│ [ Cluster select ▼ ]                                              │
│                                                                   │
│ ┌─ namespace 패턴 (선택) ─────────┐ ┌─ pod 이름 패턴 (선택) ──┐  │  ← onlyIssues && !namespace 일 때만
│ │ kube-*,monitoring,argocd       │ │ *nginx*,*api*           │  │
│ └────────────────────────────────┘ └─────────────────────────┘  │
│ 💡 콤마 구분, * ? 와일드카드. 비워두면 전체 ns 스캔.              │
│                                                                   │
│ Namespace        Pod                                              │
│ [🔍 검색...  ▼] [🔍 검색...                                  ▼]  │  ← SearchableSelect × 2
│                                                                   │
│ (선택된 pod 요약 + 자동 채우기 — 기존 그대로)                     │
└───────────────────────────────────────────────────────────────────┘
```

### 4.4 패턴 입력 표시 조건

| onlyIssues | namespace 선택됨 | 패턴 입력 | 백엔드 호출 |
|---|---|---|---|
| OFF | — | 숨김 | `useAnalyzeNamespaces(onlyIssues=false)` — fast path |
| ON | 미선택 | **표시** | scan + 패턴 적용 |
| ON | 선택됨 | 숨김 | `useAnalyzeNamespaces(onlyIssues=false)` — cluster scan 회피, pod 쿼리에서만 `onlyIssues=true` |

패턴 입력값은 토글이 OFF 가 되어도 state 로 **보존** — ON 으로 돌아오면 그대로 복원.

### 4.5 자동 선택 정책

기존 useEffect (`첫 namespace 자동 선택`, `첫 pod 자동 선택`) 그대로 둠. `if (namespace) return;` 가드가 이미 있어 사용자가 클리어하지 않는 한 재선택 안 됨.

---

## 5. 경계 케이스

| 케이스 | 동작 |
|---|---|
| 잘못된 glob (`[unclosed`) | `fnmatch` 가 리터럴로 처리 → 매치 안 되면 빈 결과. 백엔드 검증 안 함 |
| `nsPattern` 매칭 0개 | 빈 namespaces 응답 → SearchableSelect 가 emptyText 표시 |
| 패턴 입력 후 토글 OFF | 패턴 입력 hide, state 는 보존 |
| 패턴 입력하다 namespace 선택 | 패턴 입력 hide, state 보존. 토글 OFF/ns 클리어 시 복원 |
| `namespace_pattern` + `only_with_issues=false` | 패턴만 적용해 ns 리스트 줄임 (이슈 필터 없이) — 미래 확장 여지로 허용 |
| pod 패턴이 모두 미매치 | unhealthy 빈 → 비정상 ns 없음 → 응답 0개 |
| 거대 클러스터 + 패턴 미입력 | 기존 동작 그대로 (cluster-wide scan, 느림) |
| 백엔드 504 (타임아웃) | 기존처럼 `formatApiError(nsQ.error)` 로 빨간 메시지 → 사용자가 패턴 좁혀서 재시도 |
| Debounce 중 ns 선택 시도 | `nsQ.data` stale 가능 — 입력값 유지, debounce 끝나면 새 옵션으로 갱신 |

---

## 6. 수동 검증 시나리오

구현 완료 후 kind 로컬 클러스터로 확인.

1. ns 미선택 + 토글 OFF → 기존 동작 (fast ns 리스트)
2. ns 미선택 + 토글 ON + 패턴 없음 → cluster-wide scan (기존, 느림)
3. ns 미선택 + 토글 ON + `kube-*` 패턴 → kube-* ns 만 pod fetch
4. ns 미선택 + 토글 ON + ns 패턴 `default` + pod 패턴 `*nginx*` → nginx 가 비정상이면 default ns 만 결과
5. namespace 선택 + 토글 ON → cluster-wide scan 안 일어남 (네트워크 탭 확인), pod 만 이슈 필터링
6. SearchableSelect 에 1,000개 옵션 → 검색 즉시 좁혀짐, 키보드 ↑/↓/Enter/Esc 동작

---

## 7. 비목표 (Out of Scope)

- 다중 선택 SearchableSelect — 단일 선택만.
- 가상 스크롤 — 옵션 1만 개 이상에서 성능 이슈 시 도입 검토.
- Cluster 드롭다운에 SearchableSelect 적용 — 보통 클러스터 수가 적어 우선순위 낮음. 별도 작업.
- 로그 라인 필터 변경 — 이미 잘 동작 중. 손대지 않음.
- 실시간 스트리밍 변경 — 별개 기능.
- 새 백엔드 엔드포인트 추가 — 기존 `/namespaces` 만 확장.
