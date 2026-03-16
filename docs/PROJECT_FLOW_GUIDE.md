# K8s Daily Monitor — 프로젝트 요청 흐름 가이드

> 기간: 2026-02-08 ~ 2026-03-16 (총 120 커밋 / 86 PR)
> 작성일: 2026-03-16

---

## 목차

1. [프로젝트 전체 흐름](#1-프로젝트-전체-흐름)
2. [단계별 요청 요약](#2-단계별-요청-요약)
3. [Draw.io 플로우 다이어그램](#3-drawio-플로우-다이어그램)
4. [발생한 문제와 원인 분석](#4-발생한-문제와-원인-분석)
5. [효율화 가이드](#5-효율화-가이드)

---

## 1. 프로젝트 전체 흐름

```
Phase 1  ──▶  Phase 2  ──▶  Phase 3  ──▶  Phase 4  ──▶  Phase 5
인프라 기반    핵심 기능     대시보드 확장   고급 기능      UI 완성
02-08~15      02-24~27      03-03~06       03-05~11       03-16
```

총 5개 Phase로 구성되며, **인프라 → 기능 개발 → 확장 → 고도화 → UI 완성** 순으로 진행되었습니다.

---

## 2. 단계별 요청 요약

### Phase 1 — 인프라 기반 구축 (2026-02-08 ~ 2026-02-15)

| 날짜 | 요청 내용 | 커밋 유형 |
|------|-----------|-----------|
| 02-08 | Check 버튼 및 AddAddonModal 추가 | feat |
| 02-09 | 폐쇄망(air-gap) Nexus 프록시 지원 Dockerfile + 배포 스크립트 | feat |
| 02-10 | apt 소스 단순화 / bookworm 이미지 고정 | fix |
| 02-10 | libssl3 의존성 충돌 해결 | fix |
| 02-10 | **Backend Alpine 기반 전환** (근본 해결) | fix |
| 02-10 | Frontend Alpine apk 미러 프록시 지원 | feat |
| 02-11 | Ollama 자동 모델 pull + 404 처리 | fix |
| 02-11 | 모델 다운로드 진행률 UI | feat |
| 02-12 | Ollama 모델 변경 + progress UI revert (air-gap 환경) | fix/revert |
| 02-12 | **PromQL No-Code 메트릭 카드 대시보드** 추가 | feat |
| 02-15 | Prometheus + Grafana 모니터링 스택 추가 | feat |

**핵심 이슈**: Docker 베이스 이미지 의존성 충돌로 4회 연속 fix 발생
→ Debian slim → python:3.11-slim-bookworm → Alpine 순으로 이미지 교체

---

### Phase 2 — 핵심 기능 개발 (2026-02-24 ~ 2026-02-27)

| 날짜 | 요청 내용 | 커밋 유형 |
|------|-----------|-----------|
| 02-24 | CLAUDE.md 작성 (AI 어시스턴트 컨텍스트 문서화) | docs |
| 02-24 | **이슈 관리 게시판** 추가 | feat |
| 02-24 | CD 파이프라인 KUBECONFIG graceful skip | fix |
| 02-24 | OpenClaw AI 알림 에이전트 (RBAC 샌드박스) 통합 | feat |
| 02-25 | **작업(Task) 게시판** + Settings 페이지 + 버전 태그 스크립트 | feat |
| 02-26 | 사이드바 네비게이션, 이미지 붙여넣기, 클러스터 링크, UI 개선 | feat |
| 02-26 | ESLint 경고 수정 | fix |
| 02-26 | TS2322 타입 오류 fix | fix |
| 02-26 | 상세 모달, 편집 가능 네비 레이블, 공통 서비스 링크 | feat |
| 02-26 | 메트릭 카드 편집/삭제 UI + CIDR 계산기 메뉴 | feat |
| 02-26 | 클러스터 링크 + 사이드바 레이블 DB 저장 | feat |
| 02-26 | **Node Labels 관리 페이지** 통합 | feat |
| 02-27 | 노드 라벨 오류 수정 + 클러스터 등록 연결 검증 | fix |
| 02-27 | Kubeconfig 입력 방식 다양화 + in-cluster fallback | feat |
| 02-27 | Settings 클러스터 등록/삭제 버그 수정 + UI 개선 | fix/feat |

**핵심 이슈**: claude/codex 두 에이전트 병행 작업으로 merge conflict 2회 발생
→ 동일 파일(routers, metric cards)을 동시에 수정하는 구조적 문제

---

### Phase 3 — 대시보드 기능 확장 (2026-03-03 ~ 2026-03-06)

| 날짜 | 요청 내용 | 커밋 유형 |
|------|-----------|-----------|
| 03-03 | 클러스터 등록 검증 강화 (Codex) | fix |
| 03-03 | 대시보드 메트릭 카드 편집/삭제 액션 (Codex) | feat |
| 03-03 | 클러스터 등록 후 초기 헬스체크 자동 실행 | fix |
| 03-03 | **작업 게시판 달력 뷰** 추가 | feat |
| 03-03 | 게시판 정렬, 작업 분류 관리, 달력 아이콘 수정 | feat |
| 03-04 | 클러스터 관리 페이지 + 달력 기간 표시 + 메타데이터 필드 | feat |
| 03-04 | ESLint 오류 수정 | fix |
| 03-04 | **라이트/다크 테마 전환** + CIDR 계산기 클러스터 적용 | feat |
| 03-04 | Playbooks 수정(Edit) 기능 연결 | feat |
| 03-04 | First/Last Host 항목, 드래그 정렬, 대시보드 순서 고정 | feat |
| 03-04 | **워크플로우 게시판** (n8n/Airflow 스타일) | feat |
| 03-04 | 워크플로우 이름 수정 + n8n/Airflow 스타일 업데이트 | feat |
| 03-04 | 화살표→포트 정확 연결 SVG 렌더링 개선 | fix |
| 03-04 | 워크플로우 포트 드래그 연결 + 이슈 상세 내용 추가 | feat |
| 03-04 | 날짜 수정 버그 픽스 + 게시판 시간 표시 옵션 | fix/feat |
| 03-04 | **CIDR 겹침 색상 표시** 기능 | feat |
| 03-05 | **작업 가이드 게시판** + 워크플로 노드 연계 | feat |
| 03-05 | **운영 메모 게시판** (포스트잇 스타일) | feat |
| 03-05 | datetime 필드, lint 수정 | fix/feat |
| 03-05 | TS2783 중복 key fix | fix |
| 03-05 | **칸반 뷰 + 대시보드 요약 차트** 추가 | feat |
| 03-05 | classifyTask utils 파일 분리 (react-refresh lint) | fix |
| 03-05 | GHCR 이미지 정리 CD 작업 추가 | chore |
| 03-05 | GHCR delete-package-versions → github-script 교체 | fix |
| 03-05 | **5컬럼 칸반 보드 + 모듈 라벨링 시스템** | feat |
| 03-05 | ClusterLinks 레이아웃 토글 + DnD + CIDR/NIC 필드 + **마인드맵** | feat |
| 03-06 | Confluence-like WorkGuide UI + MetricCard DnD + 대시보드 All탭 | feat |
| 03-06 | MindMap 아이콘 naming conflict fix | fix |
| 03-06 | 마인드맵 방사형 → 수평 트리 레이아웃 교체 | feat |

**핵심 이슈**: 하루(03-05)에 8개 feat + 4개 fix = 12개 커밋 집중 발생
→ 단일 세션에 너무 많은 기능 요청이 몰려 품질 저하 및 후속 fix 반복

---

### Phase 4 — 기능 고도화 (2026-03-09 ~ 2026-03-11)

| 날짜 | 요청 내용 | 커밋 유형 |
|------|-----------|-----------|
| 03-09 | CIDR 겹침 PR 최종 merge | merge |
| 03-11 | **ToDoToday 할일 게시판** + 클러스터 임시 등록 지원 | feat |

---

### Phase 5 — UI 완성 (2026-03-16)

| 날짜 | 요청 내용 | 커밋 유형 |
|------|-----------|-----------|
| 03-16 | **Confluence 스타일 리치 텍스트 에디터** — 모든 게시판 텍스트 박스 통합 적용 | feat |

---

## 3. Draw.io 플로우 다이어그램

아래 XML을 draw.io에서 **File → Import From → XML** 로 가져오면 전체 플로우를 확인할 수 있습니다.

```xml
<mxGraphModel dx="1422" dy="762" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- TITLE -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="title" value="K8s Daily Monitor — 개발 요청 흐름" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=20;fontStyle=1;fontColor=#2D2D2D;" vertex="1" parent="1">
      <mxGeometry x="160" y="20" width="760" height="40" as="geometry" />
    </mxCell>
    <mxCell id="subtitle" value="2026-02-08 ~ 2026-03-16  |  총 120 커밋 / 86 PR" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=11;fontColor=#666666;" vertex="1" parent="1">
      <mxGeometry x="160" y="55" width="760" height="20" as="geometry" />
    </mxCell>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- PHASE 1 — 인프라 기반 (dark gray header) -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="p1_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0F0F0;strokeColor=#B0B0B0;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="90" width="1040" height="180" as="geometry" />
    </mxCell>
    <mxCell id="p1_header" value="Phase 1 · 인프라 기반 구축" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3D3D3D;strokeColor=#2D2D2D;fontColor=#FFFFFF;fontStyle=1;fontSize=12;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="90" width="220" height="36" as="geometry" />
    </mxCell>
    <mxCell id="p1_date" value="2026-02-08 ~ 02-15" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#888888;" vertex="1" parent="1">
      <mxGeometry x="248" y="98" width="180" height="20" as="geometry" />
    </mxCell>

    <!-- Phase 1 nodes -->
    <mxCell id="p1_n1" value="AddAddonModal&lt;br&gt;Check 버튼" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="30" y="140" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p1_n2" value="폐쇄망 Air-gap&lt;br&gt;Nexus 프록시 지원" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="175" y="140" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p1_n3" value="Docker 이미지&lt;br&gt;의존성 충돌 해결" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#A8A8A8;strokeColor=#707070;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="320" y="140" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p1_n3_sub" value="Debian→bookworm→Alpine (3회 교체)" style="text;html=1;strokeColor=none;fillColor=none;align=center;fontSize=9;fontColor=#555555;" vertex="1" parent="1">
      <mxGeometry x="310" y="183" width="150" height="18" as="geometry" />
    </mxCell>
    <mxCell id="p1_n4" value="Ollama AI Agent&lt;br&gt;자동 pull / 진행률 UI" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="465" y="140" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p1_n5" value="PromQL No-Code&lt;br&gt;메트릭 카드" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="610" y="140" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p1_n6" value="Prometheus + Grafana&lt;br&gt;모니터링 스택" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="755" y="140" width="130" height="40" as="geometry" />
    </mxCell>

    <!-- Phase 1 arrows -->
    <mxCell id="p1_a1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p1_n1" target="p1_n2">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="p1_a2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p1_n2" target="p1_n3">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="p1_a3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p1_n3" target="p1_n4">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="p1_a4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p1_n4" target="p1_n5">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="p1_a5" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p1_n5" target="p1_n6">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>

    <!-- Phase 1 → Phase 2 vertical arrow -->
    <mxCell id="phase_arrow_12" value="" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#505050;strokeWidth=2;exitX=0.5;exitY=1;exitDx=0;exitDy=0;" edge="1" parent="1">
      <mxGeometry x="520" y="270" width="50" height="20" as="geometry">
        <Array as="points">
          <mxPoint x="540" y="282" />
          <mxPoint x="540" y="300" />
        </Array>
      </mxGeometry>
    </mxCell>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- PHASE 2 — 핵심 기능 개발 -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="p2_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0F0F0;strokeColor=#B0B0B0;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="300" width="1040" height="200" as="geometry" />
    </mxCell>
    <mxCell id="p2_header" value="Phase 2 · 핵심 기능 개발" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3D3D3D;strokeColor=#2D2D2D;fontColor=#FFFFFF;fontStyle=1;fontSize=12;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="300" width="220" height="36" as="geometry" />
    </mxCell>
    <mxCell id="p2_date" value="2026-02-24 ~ 02-27  |  ⚠ merge conflict 2회" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#888888;" vertex="1" parent="1">
      <mxGeometry x="248" y="308" width="280" height="20" as="geometry" />
    </mxCell>

    <mxCell id="p2_n1" value="CLAUDE.md&lt;br&gt;AI 컨텍스트 문서화" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="30" y="352" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p2_n2" value="이슈 관리 게시판" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="175" y="352" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p2_n3" value="OpenClaw AI&lt;br&gt;알림 에이전트 (RBAC)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="320" y="352" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p2_n4" value="작업(Task) 게시판&lt;br&gt;+ Settings 페이지" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="465" y="352" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p2_n5" value="사이드바 네비게이션&lt;br&gt;이미지 붙여넣기 / 링크" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="610" y="352" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p2_n6" value="Node Labels 관리&lt;br&gt;Kubeconfig 다양화" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="755" y="352" width="130" height="40" as="geometry" />
    </mxCell>

    <!-- conflict warning box -->
    <mxCell id="p2_conflict" value="⚠ claude / codex 병렬 작업&lt;br&gt;→ 동일 파일 동시 수정으로&lt;br&gt;merge conflict 발생" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E8E8E8;strokeColor=#888888;fontSize=9;fontColor=#444444;dashed=1;" vertex="1" parent="1">
      <mxGeometry x="900" y="350" width="150" height="60" as="geometry" />
    </mxCell>

    <mxCell id="p2_a1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p2_n1" target="p2_n2"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p2_a2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p2_n2" target="p2_n3"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p2_a3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p2_n3" target="p2_n4"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p2_a4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p2_n4" target="p2_n5"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p2_a5" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p2_n5" target="p2_n6"><mxGeometry relative="1" as="geometry" /></mxCell>

    <mxCell id="phase_arrow_23" value="" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#505050;strokeWidth=2;" edge="1" parent="1">
      <mxGeometry x="520" y="500" width="50" height="20" as="geometry">
        <Array as="points">
          <mxPoint x="540" y="502" />
          <mxPoint x="540" y="520" />
        </Array>
      </mxGeometry>
    </mxCell>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- PHASE 3 — 대시보드 확장 (2 rows) -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="p3_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0F0F0;strokeColor=#B0B0B0;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="520" width="1040" height="260" as="geometry" />
    </mxCell>
    <mxCell id="p3_header" value="Phase 3 · 대시보드 기능 대확장" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3D3D3D;strokeColor=#2D2D2D;fontColor=#FFFFFF;fontStyle=1;fontSize=12;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="520" width="230" height="36" as="geometry" />
    </mxCell>
    <mxCell id="p3_date" value="2026-03-03 ~ 03-06  |  ⚠ 03-05 하루에 12개 커밋 집중" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#888888;" vertex="1" parent="1">
      <mxGeometry x="258" y="528" width="320" height="20" as="geometry" />
    </mxCell>

    <!-- Row 1 (03-03 ~ 03-04) -->
    <mxCell id="p3_n1" value="클러스터 관리 페이지&lt;br&gt;+ 메타데이터 필드" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="30" y="568" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n2" value="달력 뷰 + 정렬&lt;br&gt;작업 분류 관리" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="175" y="568" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n3" value="라이트/다크 테마&lt;br&gt;CIDR 클러스터 적용" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="320" y="568" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n4" value="워크플로우 게시판&lt;br&gt;(n8n / Airflow 스타일)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="465" y="568" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n5" value="CIDR 겹침&lt;br&gt;색상 표시" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="610" y="568" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n6" value="SVG 연결선&lt;br&gt;포트 드래그 개선" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#A8A8A8;strokeColor=#707070;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="755" y="568" width="130" height="40" as="geometry" />
    </mxCell>

    <!-- Row 2 (03-05 ~ 03-06) — 집중 폭발일 -->
    <mxCell id="p3_spike" value="🔥 03-05 집중 폭발일 (12 커밋)" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#555555;fontStyle=2;" vertex="1" parent="1">
      <mxGeometry x="30" y="618" width="250" height="18" as="geometry" />
    </mxCell>

    <mxCell id="p3_n7" value="작업 가이드 게시판&lt;br&gt;+ 워크플로 노드 연계" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="30" y="640" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n8" value="운영 메모 게시판&lt;br&gt;(포스트잇 스타일)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="175" y="640" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n9" value="칸반 뷰 + 대시보드&lt;br&gt;요약 차트" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="320" y="640" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n10" value="5컬럼 칸반 보드&lt;br&gt;+ 모듈 라벨링" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="465" y="640" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n11" value="마인드맵 +&lt;br&gt;ClusterLinks DnD" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="610" y="640" width="130" height="40" as="geometry" />
    </mxCell>
    <mxCell id="p3_n12" value="Confluence-like&lt;br&gt;WorkGuide UI" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;fontSize=10;" vertex="1" parent="1">
      <mxGeometry x="755" y="640" width="130" height="40" as="geometry" />
    </mxCell>

    <mxCell id="p3_a1" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n1" target="p3_n2"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a2" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n2" target="p3_n3"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a3" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n3" target="p3_n4"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a4" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n4" target="p3_n5"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a5" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n5" target="p3_n6"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a7" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n7" target="p3_n8"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a8" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n8" target="p3_n9"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a9" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n9" target="p3_n10"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a10" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n10" target="p3_n11"><mxGeometry relative="1" as="geometry" /></mxCell>
    <mxCell id="p3_a11" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#888888;" edge="1" parent="1" source="p3_n11" target="p3_n12"><mxGeometry relative="1" as="geometry" /></mxCell>

    <mxCell id="phase_arrow_34" value="" style="edgeStyle=orthogonalEdgeStyle;strokeColor=#505050;strokeWidth=2;" edge="1" parent="1">
      <mxGeometry x="540" y="780" width="50" height="20" as="geometry">
        <Array as="points">
          <mxPoint x="540" y="782" />
          <mxPoint x="540" y="800" />
        </Array>
      </mxGeometry>
    </mxCell>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- PHASE 4+5 — 고급 기능 + UI 완성 -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="p45_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0F0F0;strokeColor=#B0B0B0;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="800" width="1040" height="120" as="geometry" />
    </mxCell>
    <mxCell id="p4_header" value="Phase 4 · 고급 기능" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3D3D3D;strokeColor=#2D2D2D;fontColor=#FFFFFF;fontStyle=1;fontSize=12;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="20" y="800" width="180" height="36" as="geometry" />
    </mxCell>
    <mxCell id="p5_header" value="Phase 5 · UI 완성" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3D3D3D;strokeColor=#2D2D2D;fontColor=#FFFFFF;fontStyle=1;fontSize=12;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="580" y="800" width="180" height="36" as="geometry" />
    </mxCell>

    <mxCell id="p4_n1" value="ToDoToday 할일 게시판&lt;br&gt;+ 클러스터 임시 등록 지원" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="30" y="850" width="200" height="50" as="geometry" />
    </mxCell>
    <mxCell id="p4_date" value="2026-03-09 ~ 03-11" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#888888;" vertex="1" parent="1">
      <mxGeometry x="240" y="868" width="160" height="16" as="geometry" />
    </mxCell>

    <mxCell id="p5_n1" value="Confluence 스타일&lt;br&gt;리치 텍스트 에디터&lt;br&gt;(모든 게시판 통합)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#3366CC;strokeColor=#224499;fontColor=#FFFFFF;fontSize=10;fontStyle=1;" vertex="1" parent="1">
      <mxGeometry x="590" y="845" width="200" height="55" as="geometry" />
    </mxCell>
    <mxCell id="p5_date" value="2026-03-16" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#888888;" vertex="1" parent="1">
      <mxGeometry x="800" y="868" width="120" height="16" as="geometry" />
    </mxCell>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- LEGEND -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <mxCell id="leg_bg" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#C0C0C0;arcSize=4;" vertex="1" parent="1">
      <mxGeometry x="900" y="520" width="160" height="130" as="geometry" />
    </mxCell>
    <mxCell id="leg_title" value="범례" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=11;fontStyle=1;fontColor=#2D2D2D;" vertex="1" parent="1">
      <mxGeometry x="910" y="526" width="60" height="20" as="geometry" />
    </mxCell>
    <mxCell id="leg_blue" value="" style="rounded=1;fillColor=#3366CC;strokeColor=#224499;" vertex="1" parent="1">
      <mxGeometry x="910" y="552" width="24" height="16" as="geometry" />
    </mxCell>
    <mxCell id="leg_blue_txt" value="핵심 마일스톤 feat" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#2D2D2D;" vertex="1" parent="1">
      <mxGeometry x="940" y="550" width="115" height="20" as="geometry" />
    </mxCell>
    <mxCell id="leg_dkgray" value="" style="rounded=1;fillColor=#A8A8A8;strokeColor=#707070;" vertex="1" parent="1">
      <mxGeometry x="910" y="578" width="24" height="16" as="geometry" />
    </mxCell>
    <mxCell id="leg_dkgray_txt" value="문제 발생 구간" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#2D2D2D;" vertex="1" parent="1">
      <mxGeometry x="940" y="576" width="115" height="20" as="geometry" />
    </mxCell>
    <mxCell id="leg_ltgray" value="" style="rounded=1;fillColor=#D8D8D8;strokeColor=#A0A0A0;" vertex="1" parent="1">
      <mxGeometry x="910" y="604" width="24" height="16" as="geometry" />
    </mxCell>
    <mxCell id="leg_ltgray_txt" value="일반 feat / fix" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=10;fontColor=#2D2D2D;" vertex="1" parent="1">
      <mxGeometry x="940" y="602" width="115" height="20" as="geometry" />
    </mxCell>

  </root>
</mxGraphModel>
```

> **사용법**: 위 XML 블록 전체를 복사 → draw.io 열기 → **Extras → Edit Diagram** (또는 File → Import from → XML) → 붙여넣기

---

## 4. 발생한 문제와 원인 분석

### 🔴 문제 1 — Docker 이미지 의존성 충돌 (Phase 1)

| 항목 | 내용 |
|------|------|
| **현상** | libssl3, libpq-dev, gcc, ansible 충돌로 backend 빌드 실패 |
| **발생 횟수** | 4회 연속 fix 커밋 |
| **근본 원인** | 초기 베이스 이미지 선택 시 air-gap 환경(폐쇄망) 요구사항을 고려하지 않음 |
| **해결 방법** | Debian slim → python:3.11-slim-bookworm → **Alpine 최종 확정** |
| **낭비 시간** | 약 2일 (02-09 ~ 02-10) |

**교훈**: 폐쇄망/air-gap 배포 환경이라면 **베이스 이미지를 가장 먼저 확정**해야 합니다.

---

### 🔴 문제 2 — claude / codex 에이전트 병렬 작업 충돌 (Phase 2)

| 항목 | 내용 |
|------|------|
| **현상** | 동일 파일(`routers/__init__.py`, metric card 관련)을 두 에이전트가 동시 수정 |
| **발생 횟수** | merge conflict 2회 (`cb59bfa`, `14869d6`) |
| **근본 원인** | 병렬 작업 할당 시 파일 단위 분리 없이 기능 단위만 분리 |
| **해결 방법** | 충돌 후 수동 merge |
| **낭비 시간** | 약 0.5일 |

**교훈**: 여러 에이전트에게 작업을 병렬로 줄 때는 **수정 파일이 겹치지 않도록** 명시적으로 분리해야 합니다.

---

### 🟡 문제 3 — 단일 세션 과부하 (Phase 3, 03-05)

| 항목 | 내용 |
|------|------|
| **현상** | 2026-03-05 하루에 feat 8개 + fix 4개 = 12개 커밋 |
| **발생 내용** | 작업 가이드/운영 메모/칸반/GHCR/마인드맵/DnD 등 동시 요청 |
| **부작용** | fix 커밋이 바로 뒤따름 (TS 오류, react-refresh lint 등) |
| **원인** | 한 번에 많은 기능을 나열해서 요청 |

**교훈**: 하루에 요청할 기능은 **2~3개 이하**로 제한하면 품질이 올라갑니다.

---

### 🟡 문제 4 — revert 발생 (Phase 1)

| 항목 | 내용 |
|------|------|
| **현상** | `8a1626d` — 모델 다운로드 진행률 UI revert |
| **원인** | air-gap 환경에서 외부 다운로드 불가임을 개발 후 인지 |
| **낭비** | 구현 → revert = 시간 낭비 |

**교훈**: air-gap 환경 제약을 **기능 요청 전에 명시**해야 불필요한 구현과 revert를 방지할 수 있습니다.

---

### 🟡 문제 5 — 마인드맵 레이아웃 교체

| 항목 | 내용 |
|------|------|
| **현상** | `7b8815d` 방사형(radial) 구현 → `6ccfd94` 수평 트리로 교체 |
| **원인** | 레이아웃 방향에 대한 초기 요구사항 미확정 |
| **낭비** | 재구현 1회 |

**교훈**: 시각화 컴포넌트는 레이아웃 방향, 인터랙션 방식을 **미리 레퍼런스 이미지와 함께** 요청하면 재작업이 줄어듭니다.

---

## 5. 효율화 가이드

### ✅ Rule 1 — 환경 제약을 요청 첫 줄에 명시

```
❌ "Ollama 모델 다운로드 진행률 UI 추가해줘"
✅ "폐쇄망(air-gap) 환경이라 외부 다운로드 불가.
    Ollama 모델이 이미 로드된 경우에만 상태 표시해줘"
```

배포 환경 특성(air-gap, Nexus 프록시, in-cluster 등)은 매 요청마다 상기시키거나 `CLAUDE.md`에 최우선 항목으로 작성하세요.

---

### ✅ Rule 2 — 기능 요청은 하루 2~3개 이하로 분리

```
❌ "작업 가이드, 운영 메모, 칸반, GHCR 정리, 마인드맵, DnD 다 해줘"

✅ Day 1: "작업 가이드 게시판 + 워크플로 연계"
   Day 2: "운영 메모 포스트잇 게시판"
   Day 3: "칸반 뷰 + 대시보드 요약 차트"
```

한 번에 너무 많은 기능을 요청하면 각 기능의 품질이 떨어지고 후속 fix 커밋이 늘어납니다.

---

### ✅ Rule 3 — 병렬 에이전트 작업 시 파일 단위 분리

```
❌ "claude는 UI 개선, codex는 API 개선 (둘 다 routers/ 수정)"

✅ "claude는 frontend/src/components/ 만 수정
    codex는 backend/app/routers/ 만 수정"
```

수정 파일 영역이 겹치면 merge conflict가 반드시 발생합니다.

---

### ✅ Rule 4 — 시각화/UI 컴포넌트는 레퍼런스 먼저

```
✅ "마인드맵을 draw.io처럼 수평 트리 구조로 만들어줘.
    노드는 좌→우, 자식은 세로로 나열되는 형태"
```

방사형(radial) vs 수평 트리 같은 방향 결정을 나중에 바꾸면 재구현 비용이 큽니다.

---

### ✅ Rule 5 — Docker 이미지 선택 기준 사전 확정

폐쇄망 환경에서는 다음 순서로 이미지를 선택하세요:

```
1순위: python:3.11-alpine         # 최소 용량, 의존성 최소
2순위: python:3.11-slim-bookworm  # Debian 안정, ansible 필요 시
3순위: python:3.11-bookworm       # 전체 Debian (최후 수단)
```

ansible-runner가 필요하다면 `slim-bookworm`에서 시작하고,
ansible 불필요 시 `alpine`을 기본값으로 설정하세요.

---

### ✅ Rule 6 — CLAUDE.md를 살아있는 문서로 유지

현재 `CLAUDE.md`는 기술 스택, 환경변수, API 레퍼런스가 잘 정리되어 있습니다.
다음 항목도 추가하면 AI 어시스턴트의 맥락 파악이 더 빨라집니다:

```markdown
## 환경 제약
- 배포 환경: 폐쇄망 (외부 인터넷 차단)
- 패키지 경유: Nexus 프록시 레지스트리 (http://nexus.internal)
- Docker 베이스: python:3.11-alpine (backend), node:20-alpine (frontend)
- 외부 모델 다운로드: 불가 (Ollama 모델은 사전 로드 필요)

## 현재 게시판 목록
- Task Board (localStorage)
- Issue Board (localStorage)
- Ops Notes (PostgreSQL via API)
- Work Guide (PostgreSQL via API)
- Workflow Board (localStorage)
- ToDoToday (localStorage)

## 에디터 표준
- 모든 content 필드: RichTextEditor (HTML 출력)
- 기존 plain-text 데이터: RichContent 컴포넌트가 자동 감지
```

---

### ✅ Rule 7 — Fix 패턴으로 보는 품질 지표

이 프로젝트의 fix/feat 비율을 분석하면:

| Phase | feat | fix | fix 비율 |
|-------|------|-----|---------|
| Phase 1 (인프라) | 5 | 6 | **55%** ← 높음 |
| Phase 2 (기능) | 8 | 5 | 38% |
| Phase 3 (확장) | 13 | 6 | **32%** |
| Phase 4+5 | 2 | 0 | **0%** |

Phase 1의 fix 비율이 높은 이유는 베이스 이미지 문제입니다.
Phase 3 이후 fix 비율이 낮아진 것은 `CLAUDE.md`가 추가된 효과입니다.

> **목표**: fix 비율 20% 이하 유지. feat 요청 전 `CLAUDE.md` 컨텍스트 확인 습관화.

---

*이 문서는 `docs/PROJECT_FLOW_GUIDE.md`에 저장되어 있으며, 브랜치 `claude/confluence-text-editor-sd7TH`에 포함됩니다.*
