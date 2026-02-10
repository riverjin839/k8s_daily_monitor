FROM python:3.11-alpine

WORKDIR /app

# ── 폐쇄망 Nexus 프록시 지원 ──
# 사용법: docker build --build-arg ALPINE_MIRROR_URL=http://nexus:8081/repository/alpine-proxy \
#                      --build-arg PIP_INDEX_URL=http://nexus:8081/repository/pypi-proxy/simple \
#                      --build-arg PIP_TRUSTED_HOST=nexus .
ARG ALPINE_MIRROR_URL=""
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""

# Alpine apk 미러를 Nexus 프록시로 변경 (폐쇄망)
RUN if [ -n "${ALPINE_MIRROR_URL}" ]; then \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/main" > /etc/apk/repositories && \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/community" >> /etc/apk/repositories; \
    fi

# 시스템 패키지 (ansible SSH 연결용)
RUN apk add --no-cache openssh-client sshpass

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
