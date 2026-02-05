# K8s Daily Monitor

DevOps 팀을 위한 Kubernetes 클러스터 일일 운영 모니터링 대시보드

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6.svg)
![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5.svg)

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              K8s Daily Monitor                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐   │
│  │                 │     │                 │     │   Target K8s Cluster    │   │
│  │    Frontend     │     │    Backend      │     │   (10.61.162.101)       │   │
│  │  (React + TS)   │────▶│   (FastAPI)     │────▶│                         │   │
│  │                 │     │                 │     │  ┌─────────────────┐    │   │
│  │  - Dashboard    │     │  - REST API     │     │  │   API Server    │    │   │
│  │  - Cluster List │     │  - Health Check │     │  │   /healthz      │    │   │
│  │  - Check History│     │  - Scheduling   │     │  │   /livez        │    │   │
│  │  - Status Badge │     │                 │     │  │   /readyz       │    │   │
│  │                 │     │                 │     │  └─────────────────┘    │   │
│  └────────┬────────┘     └────────┬────────┘     │                         │   │
│           │                       │              │  ┌─────────────────┐    │   │
│           │ :30080                │ :30800       │  │   Components    │    │   │
│           │                       │              │  │   - etcd        │    │   │
│           │              ┌────────┴────────┐     │  │   - scheduler   │    │   │
│           │              │                 │     │  │   - controller  │    │   │
│           │              │  Celery Worker  │     │  └─────────────────┘    │   │
│           │              │  + Beat         │     │                         │   │
│           │              │                 │     │  ┌─────────────────┐    │   │
│           │              │  Daily Schedule │     │  │     Nodes       │    │   │
│           │              │  - 09:00 아침   │     │  │   - master      │    │   │
│           │              │  - 13:00 점심   │     │  │   - worker-1    │    │   │
│           │              │  - 18:00 저녁   │     │  │   - worker-2    │    │   │
│           │              │                 │     │  └─────────────────┘    │   │
│           │              └────────┬────────┘     │                         │   │
│           │                       │              └─────────────────────────┘   │
│           │                       │                                            │
│  ┌────────┴───────────────────────┴────────┐                                  │
│  │              Data Layer                  │                                  │
│  │  ┌─────────────────┐  ┌──────────────┐  │                                  │
│  │  │   PostgreSQL    │  │    Redis     │  │                                  │
│  │  │                 │  │              │  │                                  │
│  │  │  - Clusters     │  │  - Celery    │  │                                  │
│  │  │  - DailyCheckLog│  │    Broker    │  │                                  │
│  │  │  - CheckSchedule│  │  - Cache     │  │                                  │
│  │  │  - Addons       │  │              │  │                                  │
│  │  └─────────────────┘  └──────────────┘  │                                  │
│  └──────────────────────────────────────────┘                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 주요 기능

| 기능 | 설명 |
|------|------|
| **멀티 클러스터 지원** | 여러 K8s 클러스터를 한 화면에서 관리 |
| **일일 정기 점검** | 아침(09:00), 점심(13:00), 저녁(18:00) 자동 체크 |
| **직관적 상태 표시** | 초록/주황/빨강 트래픽 라이트 방식 |
| **상세 헬스체크** | API Server, Components, Nodes, System Pods |
| **히스토리 로그** | 모든 점검 이력 DB 저장 및 조회 |
| **폐쇄망 지원** | Air-gap 환경 배포 지원 |

## 기술 스택

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                               │
├──────────────────────────────────────────────────────────────┤
│  React 18 │ TypeScript │ Vite │ Tailwind CSS │ shadcn/ui    │
│  Zustand (상태관리) │ TanStack Query (서버 상태)              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                        Backend                                │
├──────────────────────────────────────────────────────────────┤
│  FastAPI │ SQLAlchemy │ Pydantic │ Celery │ Ansible         │
│  PostgreSQL │ Redis                                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     Kubernetes                                │
├──────────────────────────────────────────────────────────────┤
│  Kustomize │ Skaffold │ GitHub Actions CI/CD                 │
│  Dev / Prod / Airgap Overlays                                │
└──────────────────────────────────────────────────────────────┘
```

## 프로젝트 구조

```
k8s_daily_monitor/
├── frontend/                    # React Frontend
│   ├── src/
│   │   ├── components/          # UI 컴포넌트
│   │   ├── pages/               # 페이지
│   │   ├── stores/              # Zustand 스토어
│   │   ├── hooks/               # Custom Hooks
│   │   ├── services/            # API 서비스
│   │   └── types/               # TypeScript 타입
│   └── Dockerfile
│
├── backend/                     # FastAPI Backend
│   ├── app/
│   │   ├── models/              # SQLAlchemy 모델
│   │   │   ├── cluster.py       # 클러스터
│   │   │   ├── daily_check.py   # 일일 체크 로그/스케줄
│   │   │   └── addon.py         # 애드온
│   │   ├── routers/             # API 라우터
│   │   │   ├── clusters.py      # 클러스터 CRUD
│   │   │   ├── daily_check.py   # 일일 체크 API
│   │   │   └── health.py        # 헬스체크
│   │   ├── services/            # 비즈니스 로직
│   │   │   └── daily_checker.py # 일일 체크 서비스
│   │   ├── celery_app.py        # Celery 스케줄러
│   │   └── main.py              # FastAPI 앱
│   ├── tests/                   # 테스트
│   └── Dockerfile
│
├── k8s/                         # Kubernetes 매니페스트
│   ├── base/                    # 기본 리소스
│   │   ├── backend/
│   │   ├── frontend/
│   │   ├── postgres/
│   │   ├── redis/
│   │   └── celery/
│   └── overlays/                # 환경별 오버레이
│       ├── dev/                 # 개발 환경
│       ├── prod/                # 프로덕션
│       └── airgap/              # 폐쇄망
│
├── scripts/                     # 유틸리티 스크립트
│   ├── deploy-airgap.sh         # 폐쇄망 배포
│   └── init-cluster.sh          # 클러스터 초기 등록
│
├── ansible/                     # Ansible Playbooks
│   └── playbooks/
│
├── .github/workflows/           # CI/CD
│   ├── ci.yml                   # 테스트/린트
│   └── cd.yml                   # K8s 배포
│
├── docker-compose.yml           # 로컬 개발
├── skaffold.yaml                # K8s 개발
└── Makefile                     # 빌드 명령어
```

## 데이터베이스 스키마

```
┌─────────────────────────────────────────────────────────────────┐
│                         clusters                                 │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID, PK)                                                   │
│ name (VARCHAR)                 # dev-cluster                    │
│ api_endpoint (VARCHAR)         # https://10.61.162.101:6443     │
│ kubeconfig_path (VARCHAR)      # /root/.kube/config             │
│ status (ENUM)                  # healthy | warning | critical   │
│ created_at, updated_at                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│  check_schedules │ │ daily_check_logs│ │        addons           │
├─────────────────┤ ├─────────────────┤ ├─────────────────────────┤
│ cluster_id (FK) │ │ cluster_id (FK) │ │ cluster_id (FK)         │
│ morning_time    │ │ schedule_type   │ │ name, type, icon        │
│ noon_time       │ │ overall_status  │ │ status, response_time   │
│ evening_time    │ │ api_server_*    │ │ last_check              │
│ timezone        │ │ components_*    │ └─────────────────────────┘
│ is_active       │ │ nodes_*         │
└─────────────────┘ │ system_pods_*   │
                    │ error_messages  │
                    │ checked_at      │
                    └─────────────────┘
```

## API 엔드포인트

### 클러스터 관리
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/v1/clusters/` | 클러스터 목록 |
| POST | `/api/v1/clusters/` | 클러스터 등록 |
| GET | `/api/v1/clusters/{id}` | 클러스터 상세 |
| DELETE | `/api/v1/clusters/{id}` | 클러스터 삭제 |

### 일일 헬스체크
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/daily-check/run/{cluster_id}` | 수동 체크 실행 |
| GET | `/api/v1/daily-check/results/{cluster_id}` | 체크 결과 조회 |
| GET | `/api/v1/daily-check/results/{cluster_id}/latest` | 최신 결과 |
| GET | `/api/v1/daily-check/summary` | 전체 요약 (대시보드) |
| PUT | `/api/v1/daily-check/schedule/{cluster_id}` | 스케줄 설정 |

### 헬스 프로브
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | Liveness check |
| GET | `/health/live` | Kubernetes liveness |
| GET | `/health/ready` | Kubernetes readiness |

## 빠른 시작

### 1. Docker Compose (로컬 개발)

```bash
git clone https://github.com/YOUR_USERNAME/k8s_daily_monitor.git
cd k8s_daily_monitor

# 전체 스택 실행
docker-compose up -d

# 접속
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### 2. Kubernetes 배포 (개발 환경)

```bash
# Kustomize로 배포
kubectl apply -k k8s/overlays/dev

# 또는 Make 사용
make k8s-dev
```

### 3. 폐쇄망 배포

```bash
# 이미지 빌드 및 저장
./scripts/deploy-airgap.sh save

# 폐쇄망에서 배포
REGISTRY=10.61.162.101:5000 ./scripts/deploy-airgap.sh all

# 클러스터 등록 및 테스트
API_URL=http://10.61.162.101:30800 ./scripts/init-cluster.sh
```

## 환경별 접속 정보

### 개발 환경 (dev)
| 서비스 | URL |
|--------|-----|
| Frontend | `http://k8s-monitor-dev.local` |
| Backend | `http://k8s-monitor-dev.local/api/` |

### 폐쇄망 (airgap)
| 서비스 | URL |
|--------|-----|
| Frontend | `http://<NODE_IP>:30080` |
| Backend | `http://<NODE_IP>:30800` |
| API Docs | `http://<NODE_IP>:30800/docs` |

## 일일 체크 스케줄

| 시간 | 타입 | 설명 |
|------|------|------|
| 09:00 | morning | 아침 점검 |
| 13:00 | noon | 점심 점검 |
| 18:00 | evening | 저녁 점검 |

스케줄 변경:
```bash
curl -X PUT "http://localhost:8000/api/v1/daily-check/schedule/{cluster_id}" \
  -H "Content-Type: application/json" \
  -d '{
    "morning_time": "09:00",
    "noon_time": "13:00",
    "evening_time": "18:00",
    "timezone": "Asia/Seoul"
  }'
```

## 체크 항목

### API Server
- `/healthz` - 전체 헬스
- `/livez` - Liveness
- `/readyz` - Readiness
- 응답 시간 측정 (3초 이상 = warning)

### Components
- etcd
- kube-scheduler
- kube-controller-manager

### Nodes
- 전체 노드 수
- Ready 상태 노드 수
- 리소스 정보 (CPU, Memory, Pods)

### System Pods
- kube-system 네임스페이스
- Pod 상태 (Running, Pending, Failed)
- 재시작 횟수

## Make 명령어

```bash
make help                  # 도움말

# 로컬 개발
make dev                   # Frontend + Backend 실행
make docker-up             # Docker Compose 실행

# Kubernetes
make k8s-dev               # 개발 환경 배포
make k8s-prod              # 프로덕션 배포
make k8s-status            # 상태 확인
make k8s-logs-dev          # 로그 확인

# Skaffold
make skaffold-dev          # 개발 모드 (hot reload)
```

## CI/CD 파이프라인

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Push   │────▶│   CI    │────▶│   CD    │────▶│ Deploy  │
│         │     │         │     │         │     │         │
│ - main  │     │ - lint  │     │ - build │     │ - dev   │
│ - PR    │     │ - test  │     │ - push  │     │ - prod  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

### CI (ci.yml)
- Frontend: lint, type check, build
- Backend: pytest

### CD (cd.yml)
- Docker 이미지 빌드
- GHCR 푸시
- Kustomize로 K8s 배포

## 트러블슈팅

### 클러스터 연결 실패
```bash
# kubeconfig 확인
kubectl --kubeconfig=/path/to/config get nodes

# API 서버 접근 확인
curl -k https://10.61.162.101:6443/healthz
```

### Celery 작업 확인
```bash
# Worker 로그
kubectl logs -l app.kubernetes.io/name=celery-worker -n k8s-monitor

# Redis 연결
kubectl exec -it redis-0 -n k8s-monitor -- redis-cli ping
```

### DB 마이그레이션
```bash
# 테이블 재생성 (개발용)
kubectl exec -it backend-xxx -n k8s-monitor -- python -c "
from app.database import Base, engine
Base.metadata.create_all(bind=engine)
"
```

## 라이선스

MIT License

## 기여하기

1. Fork
2. Feature branch (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'feat: add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Pull Request
