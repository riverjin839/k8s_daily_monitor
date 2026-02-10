# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# ── 폐쇄망 Nexus 프록시 지원 ──
# 사용법: docker build --build-arg NPM_REGISTRY=http://nexus:8081/repository/npm-proxy/ \
#                      --build-arg ALPINE_MIRROR_URL=http://nexus:8081/repository/alpine-proxy \
#                      .
ARG NPM_REGISTRY=""
ARG ALPINE_MIRROR_URL=""

# Alpine apk 미러를 Nexus 프록시로 변경 (폐쇄망)
RUN if [ -n "${ALPINE_MIRROR_URL}" ]; then \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/main" > /etc/apk/repositories && \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/community" >> /etc/apk/repositories; \
    fi

# npm 레지스트리를 Nexus 프록시로 변경 (폐쇄망)
RUN if [ -n "${NPM_REGISTRY}" ]; then \
        npm config set registry "${NPM_REGISTRY}" && \
        npm config set strict-ssl false; \
    fi

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

ARG ALPINE_MIRROR_URL=""

# Production stage Alpine apk 미러 (폐쇄망)
RUN if [ -n "${ALPINE_MIRROR_URL}" ]; then \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/main" > /etc/apk/repositories && \
        echo "${ALPINE_MIRROR_URL}/v$(cat /etc/alpine-release | cut -d. -f1,2)/community" >> /etc/apk/repositories; \
    fi

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
