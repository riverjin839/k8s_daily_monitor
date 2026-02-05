# K8s Daily Monitor

DevOps 팀을 위한 Kubernetes 클러스터 일일 운영 모니터링 대시보드

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6.svg)

## 주요 기능

- 🎯 **멀티 클러스터 지원** - 여러 K8s 클러스터를 한 화면에서 관리
- 🚦 **직관적 상태 표시** - 초록/주황/빨강 트래픽 라이트 방식
- 🔧 **Ansible 기반 점검** - 유연하고 확장 가능한 헬스체크
- 📊 **히스토리 로그** - 모든 점검 이력 DB 저장
- ⏰ **자동 스케줄링** - Celery 기반 주기적 점검

## 기술 스택

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand (상태관리)
- TanStack Query (서버 상태)
- shadcn/ui (UI 컴포넌트)

### Backend
- FastAPI (Python)
- SQLAlchemy + PostgreSQL
- Celery + Redis
- Ansible

## 빠른 시작

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/k8s_daily_monitor.git
cd k8s_daily_monitor
```

### 2. Docker Compose로 실행

```bash
# 전체 스택 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 3. 개별 실행

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (새 터미널)
cd frontend
npm install
npm run dev
```

### 4. 접속

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 프로젝트 구조

```
k8s_daily_monitor/
├── frontend/          # React Frontend
├── backend/           # FastAPI Backend
├── ansible/           # Ansible Playbooks
├── docker/            # Docker 설정
├── k8s-manifests/     # K8s 배포 매니페스트
└── docs/              # 문서
```

## 환경 변수

```bash
# .env 파일 생성
cp .env.example .env
```

필수 환경 변수:
- `DATABASE_URL` - PostgreSQL 연결 문자열
- `REDIS_URL` - Redis 연결 문자열
- `SECRET_KEY` - JWT 시크릿 키

## 개발 가이드

### 브랜칭 전략

```
main (production)
  └── develop
        ├── feature/*
        └── bugfix/*
```

### 커밋 컨벤션

- `feat:` 새 기능
- `fix:` 버그 수정
- `docs:` 문서
- `refactor:` 리팩토링
- `test:` 테스트

## 라이선스

MIT License
# k8s_daily_monitor
