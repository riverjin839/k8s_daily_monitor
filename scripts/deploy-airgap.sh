#!/bin/bash
set -e

# ============================================
# 폐쇄망 K8s 배포 스크립트
# ============================================

# 설정 - 환경에 맞게 수정하세요
REGISTRY="${REGISTRY:-harbor.internal:5000}"
NAMESPACE="${NAMESPACE:-k8s-monitor}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} K8s Daily Monitor - 폐쇄망 배포${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Registry: ${YELLOW}${REGISTRY}${NC}"
echo -e "Namespace: ${YELLOW}${NAMESPACE}${NC}"
echo -e "Image Tag: ${YELLOW}${IMAGE_TAG}${NC}"
echo ""

# 1. Docker 이미지 빌드
build_images() {
    echo -e "${GREEN}[1/4] Docker 이미지 빌드 중...${NC}"

    docker build -t ${REGISTRY}/k8s-monitor/backend:${IMAGE_TAG} ./backend
    docker build -t ${REGISTRY}/k8s-monitor/frontend:${IMAGE_TAG} ./frontend

    echo -e "${GREEN}✓ 이미지 빌드 완료${NC}"
}

# 2. 이미지 푸시 (레지스트리 접근 가능한 경우)
push_images() {
    echo -e "${GREEN}[2/4] 이미지 푸시 중...${NC}"

    docker push ${REGISTRY}/k8s-monitor/backend:${IMAGE_TAG}
    docker push ${REGISTRY}/k8s-monitor/frontend:${IMAGE_TAG}

    echo -e "${GREEN}✓ 이미지 푸시 완료${NC}"
}

# 3. 이미지 저장 (오프라인 전송용)
save_images() {
    echo -e "${GREEN}[2/4] 이미지를 tar 파일로 저장 중...${NC}"

    mkdir -p ./images

    docker save ${REGISTRY}/k8s-monitor/backend:${IMAGE_TAG} | gzip > ./images/backend.tar.gz
    docker save ${REGISTRY}/k8s-monitor/frontend:${IMAGE_TAG} | gzip > ./images/frontend.tar.gz

    # 기반 이미지도 저장
    docker pull postgres:15-alpine
    docker pull redis:7-alpine
    docker save postgres:15-alpine | gzip > ./images/postgres.tar.gz
    docker save redis:7-alpine | gzip > ./images/redis.tar.gz

    echo -e "${GREEN}✓ 이미지 저장 완료 (./images/ 디렉토리)${NC}"
}

# 4. Kustomize 이미지 경로 업데이트
update_kustomization() {
    echo -e "${GREEN}[3/4] Kustomization 이미지 경로 업데이트 중...${NC}"

    cd k8s/overlays/airgap

    # kustomize edit으로 이미지 경로 설정
    kustomize edit set image \
        k8s-daily-monitor/backend=${REGISTRY}/k8s-monitor/backend:${IMAGE_TAG} \
        k8s-daily-monitor/frontend=${REGISTRY}/k8s-monitor/frontend:${IMAGE_TAG}

    cd -
    echo -e "${GREEN}✓ Kustomization 업데이트 완료${NC}"
}

# 5. K8s 배포
deploy() {
    echo -e "${GREEN}[4/4] Kubernetes에 배포 중...${NC}"

    # 네임스페이스 생성
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

    # 배포
    kubectl apply -k k8s/overlays/airgap

    echo ""
    echo -e "${GREEN}✓ 배포 완료!${NC}"
    echo ""
    echo -e "Frontend: ${YELLOW}http://<NODE_IP>:30080${NC}"
    echo -e "Backend API: ${YELLOW}http://<NODE_IP>:30800${NC}"
}

# 6. 상태 확인
status() {
    echo -e "${GREEN}배포 상태 확인 중...${NC}"
    echo ""
    kubectl get all -n ${NAMESPACE}
}

# 7. K8s API 서버 헬스 체크
check_api_server() {
    echo -e "${GREEN}K8s API 서버 상태 확인 중...${NC}"

    if kubectl cluster-info &>/dev/null; then
        echo -e "${GREEN}✓ API 서버 정상${NC}"
        kubectl get --raw='/healthz' 2>/dev/null && echo ""
        kubectl get nodes
        return 0
    else
        echo -e "${RED}✗ API 서버 연결 실패${NC}"
        return 1
    fi
}

# 메인
case "${1:-}" in
    build)
        build_images
        ;;
    push)
        push_images
        ;;
    save)
        build_images
        save_images
        ;;
    deploy)
        update_kustomization
        deploy
        ;;
    all)
        build_images
        push_images
        update_kustomization
        deploy
        ;;
    status)
        status
        ;;
    check)
        check_api_server
        ;;
    *)
        echo "사용법: $0 {build|push|save|deploy|all|status|check}"
        echo ""
        echo "  build   - Docker 이미지 빌드"
        echo "  push    - 레지스트리에 이미지 푸시"
        echo "  save    - 이미지를 tar.gz로 저장 (오프라인 전송용)"
        echo "  deploy  - K8s에 배포"
        echo "  all     - 빌드 → 푸시 → 배포"
        echo "  status  - 배포 상태 확인"
        echo "  check   - K8s API 서버 헬스 체크"
        echo ""
        echo "환경변수:"
        echo "  REGISTRY  - 컨테이너 레지스트리 (기본: harbor.internal:5000)"
        echo "  NAMESPACE - K8s 네임스페이스 (기본: k8s-monitor)"
        echo "  IMAGE_TAG - 이미지 태그 (기본: latest)"
        echo ""
        echo "예시:"
        echo "  REGISTRY=myregistry.local:5000 $0 all"
        exit 1
        ;;
esac
