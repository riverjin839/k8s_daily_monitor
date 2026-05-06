# DEVOPS MANAGEMENT 관리자(Admin) 매뉴얼

> 대상: Kubernetes 운영 담당자 / 플랫폼 관리자  
> 목적: 시스템 설치 후 **일상 운영, 점검, 장애 대응, 백업/복구**를 표준화

---

## 1. 관리자 역할과 책임

DEVOPS MANAGEMENT 관리자는 아래 업무를 수행합니다.

- 클러스터 등록/수정/삭제 및 접속 정보(kubeconfig, API endpoint) 관리
- 일일 점검 스케줄(아침/점심/저녁) 운영 및 결과 모니터링
- 상태 이상(Warning/Critical) 발생 시 원인 확인 및 조치 추적
- 데이터 백업/복구 및 릴리즈(배포) 품질 확인
- 운영 규칙(권한, 점검 기준, 대응 절차) 문서화/지속 개선

---

## 2. 시스템 구성 요약

DEVOPS MANAGEMENT는 다음 구성요소로 동작합니다.

- **Frontend**: React 기반 운영 대시보드 (NodePort: `30080` 기본)
- **Backend**: FastAPI 기반 API 서버 (NodePort: `30800` 기본)
- **Worker/Scheduler**: Celery Worker + Beat (정기 점검 실행)
- **DB**: PostgreSQL (클러스터/점검/설정 데이터 저장)
- **Cache/Broker**: Redis (비동기 작업 큐)

운영자는 최소한 다음 URL 동작을 확인해야 합니다.

- 대시보드: `http://<접속IP>:30080`
- Backend Health: `http://<접속IP>:30800/health`
- Swagger: `http://<접속IP>:30800/docs`

---

## 3. 최초 운영 시작 체크리스트

### 3.1 배포 상태 확인

```bash
kubectl get pods -n k8s-monitor
kubectl get svc -n k8s-monitor
kubectl get ingress -n k8s-monitor  # ingress 사용 시
```

확인 포인트:

- backend / frontend / celery-worker / celery-beat / postgres / redis Pod가 `Running`
- 재시작 횟수(`RESTARTS`)가 비정상적으로 증가하지 않음
- NodePort 또는 Ingress 경로가 사내망에서 접근 가능

### 3.2 API 준비 상태 확인

```bash
curl -sS http://<접속IP>:30800/health
curl -sS http://<접속IP>:30800/health/ready
```

- HTTP 200 응답 확인
- 실패 시 Backend 로그를 우선 점검

```bash
kubectl logs deploy/k8s-daily-monitor-backend -n k8s-monitor --tail=200
```

### 3.3 기본 데이터/설정 확인

- 대시보드 접속 후 클러스터 목록 페이지 로딩
- 설정(Settings) 메뉴에서 운영 레벨/기본값 확인
- 점검 결과 히스토리 조회가 정상 작동하는지 확인

---

## 4. 일상 운영(Standard Runbook)

### 4.1 클러스터 등록/수정/삭제

1. 대시보드에서 클러스터 관리 화면 이동
2. 클러스터명, API Endpoint, kubeconfig 정보 입력
3. 저장 직후 수동 점검(Manual Check) 1회 실행
4. 결과가 `Healthy`인지 확인 후 운영 대상 포함

운영 권장사항:

- 클러스터명 규칙 통일: `env-region-purpose` (예: `prod-seoul-core`)
- kubeconfig는 최소 권한 원칙(RBAC read 중심)
- 테스트/임시 클러스터는 이름 접두사(`tmp-`, `test-`)로 구분

### 4.2 정기 점검 스케줄 운영

기본 점검 주기(예시):

- 아침 09:00
- 점심 13:00
- 저녁 18:00

운영자는 월 1회 이상 아래를 확인합니다.

- 스케줄이 활성화(is_active) 상태인지
- 시간대(Timezone)가 실제 운영 시간대와 일치하는지
- 최근 7일 동안 점검 누락(실행 기록 없음)이 없는지

### 4.3 점검 결과 확인 기준

대시보드에서 각 클러스터 상태를 다음 기준으로 분류합니다.

- **Healthy(정상)**: API/컴포넌트/노드/시스템 파드 모두 정상 범위
- **Warning(주의)**: 일부 지표 지연/부분 실패
- **Critical(위험)**: 핵심 경로(API, control-plane, node 상태) 장애

Warning 이상 발생 시:

1. 최신 점검 상세(에러 메시지, 실패 항목) 확인
2. 동일 시간대의 Kubernetes 이벤트/Pod 상태/노드 상태 확인
3. 조치 내용(원인, 대응, 재발 방지)을 운영 메모 또는 티켓에 기록

---

## 5. 장애 대응 가이드

### 5.1 공통 1차 점검

```bash
kubectl get pods -n k8s-monitor
kubectl get events -n k8s-monitor --sort-by=.lastTimestamp | tail -n 30
kubectl top pods -n k8s-monitor  # metrics-server 설치 시
```

체크 항목:

- CrashLoopBackOff / ImagePullBackOff 여부
- DB/Redis 연결 실패 로그 여부
- CPU/MEM 포화로 인한 응답 지연 여부

### 5.2 Backend 장애

```bash
kubectl logs deploy/k8s-daily-monitor-backend -n k8s-monitor --tail=300
kubectl describe pod -n k8s-monitor -l app=backend
```

주요 원인:

- DB 접속 실패(비밀번호/호스트/네트워크)
- 잘못된 환경변수(SECRET_KEY, CORS, API URL)
- 신규 배포 이후 마이그레이션 불일치

### 5.3 Worker(스케줄) 장애

```bash
kubectl logs deploy/k8s-daily-monitor-celery-worker -n k8s-monitor --tail=300
kubectl logs deploy/k8s-daily-monitor-celery-beat -n k8s-monitor --tail=300
```

주요 원인:

- Redis broker 연결 실패
- 큐 적체(작업은 쌓이지만 처리 지연)
- 특정 클러스터 점검 작업의 장시간 timeout

### 5.4 복구 우선순위

1. 사용자 화면(Frontend) 접근성 복구
2. API 응답 복구(Backend health)
3. 정기 점검 파이프라인(Worker/Beat) 복구
4. 누락 점검에 대한 수동 재실행 및 이력 보정

---

## 6. 백업/복구 운영

### 6.1 백업 범위

- PostgreSQL: 클러스터 메타정보, 점검 이력, 게시판/설정 데이터
- (필요 시) 첨부/정적 파일 저장소
- 배포 매니페스트(values, kustomize overlay), 시크릿 관리 기록

### 6.2 권장 백업 주기

- DB 전체 백업: 일 1회(야간)
- 트랜잭션 중요 환경: 4~6시간 단위 증분/스냅샷
- 백업 보관: 7일(단기) + 4주(주간) + 3개월(월간)

### 6.3 복구 훈련(Drill)

월 1회 이상 아래를 검증합니다.

1. 특정 날짜 백업에서 복원 가능한지
2. 복원 후 대시보드 주요 기능(조회/등록/점검 실행)이 동작하는지
3. 복구 소요 시간(RTO)과 데이터 손실 범위(RPO)가 목표 이내인지

---

## 7. 배포/업그레이드 운영

### 7.1 배포 전 점검

- 릴리즈 노트 확인(스키마/환경변수 변경 유무)
- 운영 중 점검 배치 시간대와 충돌 없는지 확인
- 롤백 가능한 이전 이미지 태그 확보

### 7.2 배포 후 검증 (10~15분)

```bash
kubectl rollout status deploy/k8s-daily-monitor-backend -n k8s-monitor
kubectl rollout status deploy/k8s-daily-monitor-frontend -n k8s-monitor
kubectl get pods -n k8s-monitor
```

기능 검증:

- 대시보드 접속/로그인(인증 사용 시)
- 클러스터 목록 조회
- 수동 점검 실행 1회
- 최근 점검 결과 카드 렌더링

### 7.3 롤백 기준

아래 중 하나라도 충족하면 즉시 롤백을 검토합니다.

- 5분 이상 핵심 API 응답 실패 지속
- `Critical` 비율이 배포 직후 급증(배포 전 대비)
- 데이터 저장/조회 장애 재현

---

## 8. 보안/권한 운영 수칙

- kubeconfig 및 DB 비밀번호는 Git에 커밋 금지
- 운영 계정과 개발 계정 분리, 공용 계정 사용 금지
- RBAC 최소 권한 원칙 적용(읽기/진단 권한 우선)
- NodePort 직접 노출 시 사내 ACL/IP 제한 적용
- 정기적으로 Secret 로테이션(분기 1회 권장)

---

## 9. 점검 누락/오탐 최소화를 위한 운영 팁

- 점검 실패 시 1회 재시도로 네트워크 일시 장애를 분리
- 유지보수 창(Planned maintenance)에는 알림 노이즈 억제 정책 적용
- 클러스터별 임계값(노드 수, 시스템 파드 기준)을 현실적으로 조정
- 운영 메모/태스크 보드와 연계해 원인-조치-결과를 남기기

---

## 10. 운영 체크리스트 (주간/월간)

### 주간

- [ ] Warning/Critical 상위 클러스터 원인 분류 완료
- [ ] 누락 점검 건 재실행/사유 기록 완료
- [ ] 장애 대응 티켓 후속 조치 상태 확인

### 월간

- [ ] 백업 복구 훈련 1회 완료
- [ ] 스케줄/시간대/권한 정책 재검토
- [ ] 사용하지 않는 클러스터/계정/시크릿 정리
- [ ] 운영 지표(가용성, MTTR, 오탐율) 리포트 공유

---

## 부록 A. 운영자가 자주 쓰는 명령어

```bash
# 네임스페이스 전체 상태
kubectl get all -n k8s-monitor

# 최근 이벤트
kubectl get events -n k8s-monitor --sort-by=.lastTimestamp | tail -n 50

# 백엔드/워커 로그
kubectl logs deploy/k8s-daily-monitor-backend -n k8s-monitor --tail=200
kubectl logs deploy/k8s-daily-monitor-celery-worker -n k8s-monitor --tail=200
kubectl logs deploy/k8s-daily-monitor-celery-beat -n k8s-monitor --tail=200

# 서비스 접근 정보
kubectl get svc -n k8s-monitor -o wide
```

## 부록 B. 문서 버전 관리

- 문서명: `docs/ADMIN_MANUAL.md`
- 권장 업데이트 주기: 기능 릴리즈 직후 또는 월 1회
- 변경 이력은 Git 커밋 메시지에 `docs(admin): ...` 형식으로 기록
