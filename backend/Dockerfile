FROM python:3.11-alpine

WORKDIR /app

# ── 폐쇄망 Nexus 프록시 지원 ──
# 사용법: docker build --build-arg ALPINE_MIRROR_URL=http://nexus:8081/repository/alpine-proxy \
#                      --build-arg PIP_INDEX_URL=http://nexus:8081/repository/pypi-proxy/simple \
#                      --build-arg PIP_TRUSTED_HOST=nexus \
#                      --build-arg KUBECTL_MIRROR_URL=http://nexus:8081/repository/kubernetes-raw/release .
ARG ALPINE_MIRROR_URL=""
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""
ARG KUBECTL_VERSION="v1.30.0"
ARG KUBECTL_MIRROR_URL=""
ARG TARGETARCH="amd64"

# Alpine apk 미러를 Nexus 프록시로 변경 (폐쇄망)
RUN if [ -n "${ALPINE_MIRROR_URL}" ]; then \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/main" > /etc/apk/repositories && \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/community" >> /etc/apk/repositories; \
    fi

# 시스템 패키지 (ansible SSH 연결, kubectl 다운로드용)
RUN apk add --no-cache openssh-client sshpass curl ca-certificates

# kubectl 설치 — 체커/자동업데이트에서 subprocess 로 호출
# 폐쇄망이면 KUBECTL_MIRROR_URL 로 Nexus raw 저장소를 가리키게 함
RUN set -eux; \
    BASE="${KUBECTL_MIRROR_URL:-https://dl.k8s.io/release}"; \
    curl -fsSL -o /usr/local/bin/kubectl \
        "${BASE}/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl"; \
    chmod +x /usr/local/bin/kubectl; \
    kubectl version --client --output=yaml || true

# pip 프록시 설정 (폐쇄망)
RUN if [ -n "${PIP_INDEX_URL}" ]; then \
        pip config set global.index-url "${PIP_INDEX_URL}" && \
        pip config set global.trusted-host "${PIP_TRUSTED_HOST:-$(echo ${PIP_INDEX_URL} | sed 's|https\?://\([^:/]*\).*|\1|')}"; \
    fi

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
