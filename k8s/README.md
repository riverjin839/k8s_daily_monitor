# Kubernetes 배포 가이드

K8s Daily Monitor를 Kubernetes 클러스터에 배포하기 위한 가이드입니다.

## 디렉토리 구조

```
k8s/
├── base/                          # 기본 매니페스트
│   ├── kustomization.yaml         # Kustomize 설정
│   ├── namespace.yaml             # 네임스페이스
│   ├── configmap.yaml             # 애플리케이션 설정
│   ├── secret.yaml                # 시크릿 (비밀번호 등)
│   ├── ingress.yaml               # 인그레스 설정
│   ├── hpa.yaml                   # HorizontalPodAutoscaler
│   ├── postgres/                  # PostgreSQL
│   │   ├── statefulset.yaml
│   │   └── service.yaml
│   ├── redis/                     # Redis
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── backend/                   # FastAPI 백엔드
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── serviceaccount.yaml
│   ├── celery/                    # Celery Workers
│   │   ├── worker-deployment.yaml
│   │   └── beat-deployment.yaml
│   └── frontend/                  # React 프론트엔드
│       ├── deployment.yaml
│       ├── service.yaml
│       └── nginx-configmap.yaml
├── overlays/
│   ├── dev/                       # 개발 환경 오버레이
│   │   └── kustomization.yaml
│   └── prod/                      # 프로덕션 환경 오버레이
│       └── kustomization.yaml
└── ansible-playbooks/             # Ansible 플레이북 (ConfigMap용)
    └── check_cluster.yml
```

## 사전 요구사항

1. **Kubernetes 클러스터** (v1.25+)
2. **kubectl** 설치
3. **Kustomize** 설치 (v5.0+)
4. **NGINX Ingress Controller** 설치
5. **StorageClass** 설정 (PostgreSQL PVC용)

## 빠른 시작

### 1. 개발 환경 배포

```bash
# 매니페스트 미리보기
kustomize build k8s/overlays/dev

# 배포
kustomize build k8s/overlays/dev | kubectl apply -f -

# 또는 kubectl로 직접
kubectl apply -k k8s/overlays/dev
```

### 2. 프로덕션 환경 배포

```bash
# 시크릿 수정 (반드시 수행!)
# k8s/overlays/prod/kustomization.yaml에서 시크릿 값 변경

# 배포
kustomize build k8s/overlays/prod | kubectl apply -f -
```

## 환경별 설정

### 개발 환경 (dev)

- **네임스페이스**: `k8s-monitor-dev`
- **리소스 접두사**: `dev-`
- **레플리카 수**: 각 컴포넌트 1개
- **인그레스 호스트**: `k8s-monitor-dev.local`
- **디버그 모드**: 활성화
- **체크 주기**: 1분

### 프로덕션 환경 (prod)

- **네임스페이스**: `k8s-monitor-prod`
- **리소스 접두사**: `prod-`
- **레플리카 수**: Backend/Frontend/Celery 각 3개
- **인그레스 호스트**: `k8s-monitor.example.com`
- **TLS**: Let's Encrypt 인증서 (cert-manager 필요)
- **HPA**: 자동 스케일링 활성화

## 컴포넌트 설명

### Backend (FastAPI)

- **포트**: 8000
- **헬스 체크**: `/health`
- **리소스 제한**: 512Mi RAM, 500m CPU (기본)
- **ServiceAccount**: `k8s-monitor-sa` (클러스터 읽기 권한)

### Frontend (React + Nginx)

- **포트**: 80
- **API 프록시**: `/api/*` → backend:8000
- **정적 파일 캐싱**: 1년
- **SPA 라우팅**: 모든 경로 → index.html

### Celery Worker

- **동시성**: 2 (기본)
- **태스크**: 클러스터 헬스 체크
- **Ansible 플레이북 마운트**

### Celery Beat

- **스케줄러**: 주기적 헬스 체크 실행
- **레플리카**: 항상 1개 (중복 방지)

### PostgreSQL

- **버전**: 15-alpine
- **StatefulSet**: 데이터 영속성 보장
- **PVC**: 10Gi (개발), 50Gi (프로덕션)

### Redis

- **버전**: 7-alpine
- **용도**: Celery 브로커, 캐시
- **메모리 정책**: allkeys-lru (256MB 제한)

## 시크릿 관리

### 프로덕션 환경 시크릿

프로덕션 환경에서는 다음 방법 중 하나를 사용하세요:

1. **External Secrets Operator**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: k8s-monitor-secret
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: k8s-monitor-secret
  data:
    - secretKey: DATABASE_PASSWORD
      remoteRef:
        key: k8s-monitor/database
        property: password
```

2. **Sealed Secrets**
```bash
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
```

3. **HashiCorp Vault**
```yaml
annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "k8s-monitor"
```

## 모니터링 클러스터 추가

다른 Kubernetes 클러스터를 모니터링하려면:

### 1. kubeconfig Secret 생성

```bash
kubectl create secret generic kubeconfig-secret \
  --from-file=config=/path/to/target/kubeconfig \
  -n k8s-monitor
```

### 2. 클러스터 등록 (API)

```bash
curl -X POST http://k8s-monitor.local/api/v1/clusters \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-cluster",
    "api_endpoint": "https://k8s-api.example.com:6443",
    "kubeconfig_path": "/root/.kube/config"
  }'
```

## HPA (Horizontal Pod Autoscaler)

### 설정된 HPA

| 컴포넌트 | Min | Max | CPU 임계값 |
|---------|-----|-----|-----------|
| Backend | 2 | 10 | 70% |
| Celery Worker | 2 | 8 | 70% |
| Frontend | 2 | 6 | 70% |

### HPA 상태 확인

```bash
kubectl get hpa -n k8s-monitor
kubectl describe hpa backend-hpa -n k8s-monitor
```

## 트러블슈팅

### 파드 상태 확인

```bash
kubectl get pods -n k8s-monitor
kubectl describe pod <pod-name> -n k8s-monitor
kubectl logs <pod-name> -n k8s-monitor
```

### 데이터베이스 연결 문제

```bash
# PostgreSQL 파드 접속
kubectl exec -it postgres-0 -n k8s-monitor -- psql -U postgres -d k8s_monitor

# 연결 테스트
kubectl run psql-test --rm -it --image=postgres:15-alpine \
  --restart=Never -n k8s-monitor -- \
  psql postgresql://postgres:password@postgres:5432/k8s_monitor
```

### Celery 작업 확인

```bash
# Worker 로그
kubectl logs -l app.kubernetes.io/name=celery-worker -n k8s-monitor --tail=100

# Redis 연결 테스트
kubectl exec -it $(kubectl get pod -l app.kubernetes.io/name=redis -o jsonpath='{.items[0].metadata.name}' -n k8s-monitor) -n k8s-monitor -- redis-cli ping
```

## CI/CD

GitHub Actions를 통한 자동 배포가 설정되어 있습니다.

### 필요한 GitHub Secrets

| Secret | 설명 |
|--------|------|
| `KUBECONFIG_DEV` | 개발 클러스터 kubeconfig (base64 인코딩) |
| `KUBECONFIG_PROD` | 프로덕션 클러스터 kubeconfig (base64 인코딩) |

### kubeconfig 인코딩

```bash
cat ~/.kube/config | base64 -w 0
```

### 수동 배포 트리거

GitHub Actions > CD - Kubernetes Deployment > Run workflow

## 리소스 정리

```bash
# 개발 환경 삭제
kubectl delete -k k8s/overlays/dev

# 프로덕션 환경 삭제
kubectl delete -k k8s/overlays/prod

# 네임스페이스만 삭제 (모든 리소스 함께 삭제됨)
kubectl delete namespace k8s-monitor-dev
kubectl delete namespace k8s-monitor-prod
```

## 업그레이드

### 롤링 업데이트

```bash
# 이미지 태그 변경
kustomize edit set image k8s-daily-monitor/backend=ghcr.io/your-repo/backend:v1.2.0
kustomize edit set image k8s-daily-monitor/frontend=ghcr.io/your-repo/frontend:v1.2.0

# 적용
kustomize build k8s/overlays/prod | kubectl apply -f -

# 롤아웃 상태 확인
kubectl rollout status deployment/prod-backend -n k8s-monitor-prod
```

### 롤백

```bash
kubectl rollout undo deployment/prod-backend -n k8s-monitor-prod
kubectl rollout undo deployment/prod-frontend -n k8s-monitor-prod
```
