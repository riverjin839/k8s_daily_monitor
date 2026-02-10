FROM python:3.11-slim-bookworm

WORKDIR /app

# ── 폐쇄망 Nexus 프록시 지원 ──
# 사용법: docker build --build-arg APT_MIRROR_URL=http://nexus.local:8081/repository/debian-proxy \
#                      --build-arg PIP_INDEX_URL=http://nexus.local:8081/repository/pypi-proxy/simple \
#                      --build-arg PIP_TRUSTED_HOST=nexus.local .
ARG APT_MIRROR_URL=""
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""

# apt 소스를 Nexus 프록시로 변경 (폐쇄망)
RUN if [ -n "${APT_MIRROR_URL}" ]; then \
        rm -f /etc/apt/sources.list.d/*.sources && \
        echo "deb ${APT_MIRROR_URL} bookworm main" > /etc/apt/sources.list; \
    fi

# 시스템 패키지 설치 (최소화)
# - gcc, libpq-dev 제거: psycopg2-binary가 wheel로 libpq 내장, 컴파일 불필요
# - ansible 제거: ansible-runner(pip)가 ansible-core 자동 설치
# - openssh-client: ansible SSH 연결용, sshpass: 패스워드 기반 SSH용
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    sshpass \
    && rm -rf /var/lib/apt/lists/*

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
