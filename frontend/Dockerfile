# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# ── 폐쇄망 Nexus 프록시 지원 ──
# 사용법: docker build --build-arg NPM_REGISTRY=http://nexus.local:8081/repository/npm-proxy/ .
ARG NPM_REGISTRY=""

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

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
