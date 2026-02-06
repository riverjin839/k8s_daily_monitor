#!/bin/bash
set -e

# ============================================
# Phase 1: kind 클러스터 로컬 개발 환경
# Mac/Linux에서 git clone 후 바로 실행
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLUSTER_NAME="${CLUSTER_NAME:-k8s-monitor-dev}"
REGISTRY_NAME="${REGISTRY_NAME:-kind-registry}"
REGISTRY_PORT="${REGISTRY_PORT:-5001}"
NAMESPACE="k8s-monitor"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================
# 사전 요구사항 확인
# ============================================
check_prerequisites() {
    echo -e "${CYAN}[사전 확인] 필수 도구 확인 중...${NC}"
    local missing=()

    for cmd in docker kind kubectl; do
        if ! command -v "${cmd}" &>/dev/null; then
            missing+=("${cmd}")
        else
            local ver
            ver=$("${cmd}" version --client 2>/dev/null | head -1 || "${cmd}" --version 2>/dev/null | head -1)
            echo -e "  ✓ ${cmd}: ${ver}"
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo ""
        echo -e "${RED}누락된 도구: ${missing[*]}${NC}"
        echo ""
        echo "설치 방법 (Mac):"
        echo "  brew install docker kind kubectl"
        echo "  또는 Docker Desktop 설치 후: brew install kind"
        exit 1
    fi

    echo -e "${GREEN}✓ 모든 도구 확인 완료${NC}"
    echo ""
}

# ============================================
# Local Registry 생성 (kind용)
# ============================================
create_local_registry() {
    if docker inspect "${REGISTRY_NAME}" &>/dev/null; then
        echo -e "${YELLOW}로컬 레지스트리 이미 실행 중 (localhost:${REGISTRY_PORT})${NC}"
        return
    fi

    echo -e "${CYAN}[1/5] 로컬 레지스트리 생성 중...${NC}"
    docker run -d --restart=always \
        -p "127.0.0.1:${REGISTRY_PORT}:5000" \
        --network bridge \
        --name "${REGISTRY_NAME}" \
        registry:2

    echo -e "${GREEN}✓ 로컬 레지스트리: localhost:${REGISTRY_PORT}${NC}"
}

# ============================================
# kind 클러스터 생성
# ============================================
create_cluster() {
    if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
        echo -e "${YELLOW}kind 클러스터 '${CLUSTER_NAME}' 이미 존재${NC}"
        kubectl cluster-info --context "kind-${CLUSTER_NAME}" 2>/dev/null || true
        return
    fi

    echo -e "${CYAN}[2/5] kind 클러스터 생성 중...${NC}"

    cat <<KINDEOF | kind create cluster --name "${CLUSTER_NAME}" --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
containerdConfigPatches:
  - |-
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:${REGISTRY_PORT}"]
      endpoint = ["http://${REGISTRY_NAME}:5000"]
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080
        hostPort: 30080
        protocol: TCP
      - containerPort: 30800
        hostPort: 30800
        protocol: TCP
  - role: worker
  - role: worker
KINDEOF

    # 레지스트리를 kind 네트워크에 연결
    if ! docker network inspect kind | grep -q "${REGISTRY_NAME}"; then
        docker network connect kind "${REGISTRY_NAME}" 2>/dev/null || true
    fi

    # 레지스트리 ConfigMap (kind에서 로컬 레지스트리 인식용)
    kubectl apply -f - <<CMEOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REGISTRY_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
CMEOF

    echo -e "${GREEN}✓ kind 클러스터 생성 완료 (control-plane 1 + worker 2)${NC}"
}

# ============================================
# 이미지 빌드 & 푸시
# ============================================
build_and_push() {
    echo -e "${CYAN}[3/5] 이미지 빌드 및 레지스트리 푸시 중...${NC}"

    echo -e "  → backend 빌드..."
    docker build \
        -t "localhost:${REGISTRY_PORT}/k8s-monitor/backend:latest" \
        -f "${PROJECT_ROOT}/backend/Dockerfile" \
        "${PROJECT_ROOT}/backend"

    echo -e "  → frontend 빌드..."
    docker build \
        -t "localhost:${REGISTRY_PORT}/k8s-monitor/frontend:latest" \
        -f "${PROJECT_ROOT}/frontend/Dockerfile" \
        "${PROJECT_ROOT}/frontend"

    echo -e "  → 이미지 푸시..."
    docker push "localhost:${REGISTRY_PORT}/k8s-monitor/backend:latest"
    docker push "localhost:${REGISTRY_PORT}/k8s-monitor/frontend:latest"

    echo -e "${GREEN}✓ 이미지 빌드 & 푸시 완료${NC}"
}

# ============================================
# K8s 배포
# ============================================
deploy() {
    echo -e "${CYAN}[4/5] K8s 배포 중...${NC}"

    kubectl config use-context "kind-${CLUSTER_NAME}"

    # 네임스페이스
    kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

    # Kustomize로 배포 (dev overlay 기반, 이미지만 로컬 레지스트리로)
    kubectl apply -k "${PROJECT_ROOT}/k8s/overlays/dev"

    # 이미지 경로를 로컬 레지스트리로 패치
    for deploy in backend celery-worker celery-beat; do
        kubectl set image "deployment/dev-${deploy}" \
            "*=localhost:${REGISTRY_PORT}/k8s-monitor/backend:latest" \
            -n k8s-monitor-dev 2>/dev/null || true
    done

    kubectl set image deployment/dev-frontend \
        "*=localhost:${REGISTRY_PORT}/k8s-monitor/frontend:latest" \
        -n k8s-monitor-dev 2>/dev/null || true

    echo -e "${GREEN}✓ 배포 완료${NC}"
}

# ============================================
# 상태 확인 및 대기
# ============================================
wait_and_verify() {
    echo -e "${CYAN}[5/5] 배포 확인 중...${NC}"
    echo ""

    local ns="k8s-monitor-dev"

    echo "Pod 상태 대기 중 (최대 3분)..."
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/part-of=k8s-daily-monitor \
        -n "${ns}" --timeout=180s 2>/dev/null || true

    echo ""
    kubectl get pods -n "${ns}" -o wide
    echo ""

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN} 접속 정보${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "  Frontend:  ${YELLOW}http://localhost:30080${NC}"
    echo -e "  Backend:   ${YELLOW}http://localhost:30800${NC}"
    echo -e "  API Docs:  ${YELLOW}http://localhost:30800/docs${NC}"
    echo ""
    echo -e "  kubectl:   ${CYAN}kubectl get all -n ${ns}${NC}"
    echo -e "  로그:      ${CYAN}kubectl logs -f deploy/dev-backend -n ${ns}${NC}"
    echo ""
}

# ============================================
# 클러스터 삭제
# ============================================
destroy() {
    echo -e "${YELLOW}kind 클러스터 삭제 중...${NC}"
    kind delete cluster --name "${CLUSTER_NAME}"
    docker rm -f "${REGISTRY_NAME}" 2>/dev/null || true
    echo -e "${GREEN}✓ 정리 완료${NC}"
}

# ============================================
# 이미지만 재빌드 + 재배포 (코드 수정 후)
# ============================================
reload() {
    echo -e "${CYAN}이미지 재빌드 & 재배포 중...${NC}"
    build_and_push

    local ns="k8s-monitor-dev"
    kubectl rollout restart deployment/dev-backend -n "${ns}"
    kubectl rollout restart deployment/dev-frontend -n "${ns}"
    kubectl rollout restart deployment/dev-celery-worker -n "${ns}"
    kubectl rollout restart deployment/dev-celery-beat -n "${ns}"

    echo "롤아웃 대기 중..."
    kubectl rollout status deployment/dev-backend -n "${ns}" --timeout=120s || true

    echo -e "${GREEN}✓ 재배포 완료${NC}"
}

# ============================================
# 메인
# ============================================
case "${1:-}" in
    up)
        check_prerequisites
        create_local_registry
        create_cluster
        build_and_push
        deploy
        wait_and_verify
        ;;
    build)
        build_and_push
        ;;
    deploy)
        deploy
        wait_and_verify
        ;;
    reload)
        reload
        ;;
    status)
        kubectl get all -n k8s-monitor-dev
        ;;
    logs)
        kubectl logs -f "deploy/dev-${2:-backend}" -n k8s-monitor-dev
        ;;
    destroy)
        destroy
        ;;
    *)
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN} K8s Daily Monitor - kind 로컬 개발${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo "사용법: $0 {up|build|deploy|reload|status|logs|destroy}"
        echo ""
        echo "  up       - 전체 환경 구축 (kind + 빌드 + 배포)"
        echo "  build    - 이미지 빌드만"
        echo "  deploy   - K8s 배포만"
        echo "  reload   - 코드 수정 후 재빌드 & 재배포"
        echo "  status   - Pod 상태 확인"
        echo "  logs     - 로그 확인 (예: $0 logs backend)"
        echo "  destroy  - 전체 환경 삭제"
        echo ""
        echo "일반적인 흐름:"
        echo "  1. $0 up                # 최초 1회"
        echo "  2. (코드 수정)"
        echo "  3. $0 reload            # 수정 후 재배포"
        echo "  4. $0 destroy           # 테스트 완료 후 정리"
        echo ""
        exit 1
        ;;
esac
