# CLAUDE.md — K8s Daily Monitor

This file provides essential context for AI assistants (Claude and others) working on this codebase.

---

## Project Overview

**K8s Daily Monitor** is a DevOps-focused Kubernetes cluster health monitoring dashboard. It performs automated daily health checks at 09:00, 13:00, and 18:00 KST across multiple clusters and surfaces results in a React dashboard.

Core capabilities:
- Multi-cluster management (add, remove, check any Kubernetes cluster)
- Scheduled health checks via Celery Beat (API server, components, nodes, system pods)
- Real-time PromQL metric cards queried against Prometheus
- AI Agent chat powered by a local Ollama LLM (optional, fail-safe)
- Ansible Playbook execution per cluster
- Air-gapped / closed-network deployment support

---

## Tech Stack

### Backend (`backend/`)
| Layer | Technology |
|---|---|
| Framework | FastAPI 0.109 + Uvicorn |
| ORM | SQLAlchemy 2.0 |
| DB | PostgreSQL 15 (via psycopg2-binary) |
| Migrations | Lightweight inline (`_run_migrations()` in `main.py`) — **no Alembic CLI** |
| Task queue | Celery 5.3 + Redis 7 |
| Scheduler | Celery Beat (crontab: 09:00 / 13:00 / 18:00 KST) |
| HTTP client | httpx (async) |
| Config | pydantic-settings (`Settings` class reads `.env`) |
| K8s checks | `subprocess` calling `kubectl` + `kubernetes==29.0.0` SDK |
| AI Agent | Ollama HTTP API (local, optional) |
| Automation | ansible-runner |
| Python | 3.11 |

### Frontend (`frontend/`)
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript 5.3 |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 + shadcn/ui (Radix primitives) |
| State | Zustand 4 (client state) + TanStack Query 5 (server state) |
| HTTP | axios |
| Charts | Recharts |
| Routing | React Router v6 |
| Icons | lucide-react |
| Linting | ESLint 8 + TypeScript ESLint |

### Infrastructure
| Concern | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| K8s manifests | Kustomize (base + overlays: dev / prod / airgap / kind) |
| Helm chart | `helm/k8s-daily-monitor/` (values-dev / values-prod / values-airgap) |
| Local K8s | kind (`scripts/kind-setup.sh`) |
| Dev loop | Skaffold (`skaffold.yaml`) |
| CI | GitHub Actions (`ci.yml`) |
| CD | GitHub Actions (`cd.yml`) → GHCR → Kustomize deploy |
| GitOps | ArgoCD (`argocd/`) |
| Jenkins | `Jenkinsfile` (phase 3 production) |

---

## Repository Layout

```
k8s_daily_monitor/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS, router registration
│   │   ├── config.py            # pydantic-settings Settings class
│   │   ├── database.py          # SQLAlchemy engine + SessionLocal + Base
│   │   ├── celery_app.py        # Celery app + Beat schedule (3x/day)
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── cluster.py       # Cluster, StatusEnum
│   │   │   ├── daily_check.py   # DailyCheckLog, CheckSchedule, CheckScheduleType
│   │   │   ├── addon.py         # Addon (per-cluster add-ons e.g. Nexus, Keycloak)
│   │   │   ├── check_log.py     # CheckLog
│   │   │   ├── metric_card.py   # MetricCard (PromQL dashboard builder)
│   │   │   └── playbook.py      # Playbook (Ansible)
│   │   ├── routers/             # FastAPI APIRouter modules
│   │   │   ├── clusters.py      # /api/v1/clusters
│   │   │   ├── daily_check.py   # /api/v1/daily-check
│   │   │   ├── health.py        # /api/v1/health (per-cluster)
│   │   │   ├── history.py       # /api/v1/history
│   │   │   ├── playbooks.py     # /api/v1/playbooks
│   │   │   ├── agent.py         # /api/v1/agent (Ollama AI)
│   │   │   └── promql.py        # /api/v1/promql (PromQL cards + queries)
│   │   └── services/
│   │       ├── daily_checker.py          # DailyChecker: orchestrates health checks
│   │       ├── health_checker.py         # Addon/cluster health checks
│   │       ├── agent_service.py          # AIAgentService (Ollama wrapper)
│   │       ├── prometheus_service.py     # PrometheusService (PromQL queries)
│   │       ├── playbook_executor.py      # Ansible playbook execution
│   │       └── checkers/                # Modular checkers (one per component)
│   │           ├── base.py
│   │           ├── argocd_checker.py
│   │           ├── control_plane_checker.py
│   │           ├── etcd_checker.py
│   │           ├── jenkins_checker.py
│   │           ├── keycloak_checker.py
│   │           ├── nexus_checker.py
│   │           ├── node_checker.py
│   │           └── system_pod_checker.py
│   ├── tests/
│   │   └── test_api.py          # pytest tests for root / health endpoints
│   ├── requirements.txt
│   ├── pytest.ini               # testpaths=tests, asyncio_mode=auto
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # React Router setup (Dashboard + PlaybooksPage)
│   │   ├── main.tsx             # Entry point
│   │   ├── types/index.ts       # All shared TypeScript interfaces
│   │   ├── services/api.ts      # axios-based API service layer
│   │   ├── stores/
│   │   │   ├── clusterStore.ts  # Zustand: cluster selection state
│   │   │   └── playbookStore.ts # Zustand: playbook state
│   │   ├── hooks/
│   │   │   ├── useCluster.ts    # TanStack Query: clusters data
│   │   │   ├── useMetricCards.ts# TanStack Query: PromQL cards
│   │   │   └── usePlaybook.ts   # TanStack Query: playbooks
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Main monitoring dashboard
│   │   │   └── PlaybooksPage.tsx
│   │   ├── components/
│   │   │   ├── dashboard/       # ClusterTabs, MetricCard, AddonCard, StatusBadge…
│   │   │   ├── agent/           # AgentChat (Ollama AI sidebar)
│   │   │   ├── playbooks/       # PlaybookCard, AddPlaybookModal
│   │   │   └── layout/          # Header
│   │   └── config/
│   │       └── addons.config.ts # Static list of supported addon types
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── Dockerfile               # nginx-based production image
│
├── k8s/
│   ├── base/                    # Base Kustomize resources
│   │   ├── backend/, frontend/, postgres/, redis/, celery/
│   │   ├── ollama.yaml          # Optional Ollama deployment
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── dev/                 # Namespace: k8s-monitor-dev
│       ├── prod/                # Namespace: k8s-monitor-prod
│       ├── kind/                # Local kind cluster
│       └── airgap/              # Closed-network (registry mirror)
│
├── helm/k8s-daily-monitor/      # Helm chart for production
│   ├── values.yaml              # Defaults
│   ├── values-dev.yaml
│   ├── values-prod.yaml
│   └── values-airgap.yaml
│
├── scripts/
│   ├── kind-setup.sh            # up / reload / destroy for local kind
│   ├── deploy-airgap.sh         # Interactive airgap deployment
│   └── init-cluster.sh          # Register initial cluster via API
│
├── ansible/playbooks/           # Ansible playbooks run by backend
├── argocd/                      # ArgoCD Application + Project manifests
├── docs/
│   ├── DEPLOY_GUIDE.md          # 3-phase deployment guide
│   └── PROJECT_PLAN.md
├── docker-compose.yml           # Local development (postgres + redis + backend + frontend + celery)
├── skaffold.yaml                # Skaffold dev config
├── Makefile                     # Convenience targets (see below)
├── Jenkinsfile                  # Jenkins pipeline for phase-3 production
└── .env.example                 # Template for backend environment variables
```

---

## Development Workflows

### Local Development (Docker Compose) — Recommended for most changes

```bash
# Start all services (postgres, redis, backend, frontend, celery worker + beat)
docker-compose up -d

# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
# Stop
docker-compose down
```

### Local Development (native processes)

```bash
# Install dependencies
make install

# Run frontend + backend concurrently
make dev
# Backend: http://localhost:8000
# Frontend: http://localhost:5173

# Backend only
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend only
cd frontend && npm run dev
```

### Local Kubernetes (kind)

```bash
# Create cluster, build images, deploy everything
bash scripts/kind-setup.sh up

# After code changes, rebuild and redeploy
bash scripts/kind-setup.sh reload

# Tear down
bash scripts/kind-setup.sh destroy

# URLs: http://localhost:30080 (frontend), http://localhost:30800/docs (API)
```

### Skaffold (hot-reload on K8s)

```bash
make skaffold-dev    # watches src/, rebuilds on change
```

---

## Running Tests

### Backend

```bash
cd backend
pytest -v
```

Tests require a running PostgreSQL instance. In CI, one is provided as a service container. Locally you can point to the Docker Compose postgres:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/k8s_monitor_test pytest -v
```

`pytest.ini` settings: `testpaths = tests`, `asyncio_mode = auto`.

### Frontend

```bash
cd frontend
npm run lint          # ESLint (max-warnings 0 — zero tolerance)
npx tsc --noEmit      # TypeScript type check
npm run build         # Production build (also validates TS)
```

There are no Jest/Vitest unit tests currently. CI validates lint + type-check + build.

---

## Environment Variables

Copy `.env.example` → `.env` in the **backend** directory for local development.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/k8s_monitor` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Celery broker |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/0` | Celery result store |
| `SECRET_KEY` | *(change in production)* | JWT signing key |
| `DEBUG` | `false` | FastAPI debug mode |
| `CHECK_INTERVAL_MINUTES` | `5` | Health check interval |
| `CHECK_TIMEOUT_SECONDS` | `30` | kubectl/HTTP timeout |
| `OLLAMA_URL` | `http://ollama:11434` | Ollama base URL |
| `OLLAMA_MODEL` | `llama3` | LLM model name |
| `OLLAMA_TIMEOUT` | `120` | LLM request timeout (s) |
| `PROMETHEUS_URL` | `http://prometheus-k8s.monitoring.svc:9090` | Prometheus endpoint |
| `GRAFANA_URL` | `http://grafana.monitoring.svc:3000` | Grafana endpoint |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated extra CORS origins |

The `Settings` class (`backend/app/config.py`) uses pydantic-settings and reads from `.env` automatically. All variable names are case-insensitive.

---

## Backend Architecture Details

### Database / Migrations

- Tables are created automatically at startup via `Base.metadata.create_all(bind=engine)` in the `lifespan` context manager (`main.py`).
- Schema additions use a lightweight `_run_migrations()` function that inspects existing columns and runs `ALTER TABLE` as needed. **There is no Alembic migration workflow.** When adding new columns, add an `ALTER TABLE` check in `_run_migrations()`.
- On first startup `_seed_default_metric_cards()` inserts 6 default PromQL cards if the `metric_cards` table is empty.

### Router Registration

All routers are imported from `app/routers/__init__.py` and mounted under `/api/v1` in `main.py`. To add a new router:
1. Create `backend/app/routers/my_router.py` with an `APIRouter`.
2. Export it from `backend/app/routers/__init__.py`.
3. Include it in `main.py` with `app.include_router(...)`.

### Celery Tasks

`celery_app.py` defines two tasks:
- `run_scheduled_check(schedule_type)` — called by Beat 3× per day; iterates all clusters.
- `run_single_check(cluster_id)` — triggered manually from the API.

Both bridge async `DailyChecker` methods using `asyncio.new_event_loop()` + `loop.run_until_complete()`.

### Health Check Logic (`services/daily_checker.py`)

`DailyChecker.run_daily_check()` orchestrates four sub-checks:
1. `_check_api_server` — HTTP GET to `{cluster.api_endpoint}/{healthz,livez,readyz}` via httpx.
2. `_check_components` — `kubectl get componentstatuses -o json`.
3. `_check_nodes` — `kubectl get nodes -o json`.
4. `_check_system_pods` — `kubectl get pods -n kube-system -o json`.

Overall status precedence: `critical` > `warning` > `healthy`.

### Fail-Safe External Services

Both `AIAgentService` (`agent_service.py`) and `PrometheusService` (`prometheus_service.py`) follow the same pattern: **all exceptions are caught, returning structured offline/error dicts**. They never raise HTTP 500s. The dashboard continues to work even when Ollama or Prometheus is unavailable.

### AI Agent (Ollama)

- Endpoint: `/api/v1/agent/chat` (POST), `/api/v1/agent/health` (GET).
- Default model: `llama3` (configurable via `OLLAMA_MODEL`).
- Context dict fields: `cluster_name`, `cluster_status`, `pod_logs`, `node_status`, `error_messages`, `extra`.
- Model auto-pull is NOT done at startup; call `POST /api/v1/agent/pull-model` to trigger it.

### PromQL Metric Cards

- Stored in `metric_cards` PostgreSQL table.
- Seeded with 6 defaults on first run (CrashLoopBackOff pods, Failed pods, CPU/Memory usage, PVC disk, network).
- `display_type`: `value` | `gauge` | `list`.
- `thresholds`: string format `"warning:70,critical:90"`.
- Query execution: `GET /api/v1/promql/query/{card_id}` or `GET /api/v1/promql/query/all`.

---

## Frontend Architecture Details

### State Management

- **Zustand stores** (`stores/`) manage client-only state (selected cluster, etc.).
- **TanStack Query hooks** (`hooks/`) manage all server state with caching and background refetching.
- Do not mix Zustand with server state — use TanStack Query for anything fetched from the API.

### API Service Layer

All backend calls go through `src/services/api.ts`. It wraps axios and provides typed functions for each resource. When adding a new backend endpoint, add a corresponding function here.

### TypeScript Types

All shared interfaces live in `src/types/index.ts`. Keep backend response shapes and frontend types in sync here. Key types: `Cluster`, `Addon`, `CheckLog`, `Playbook`, `MetricCard`, `MetricQueryResult`, `AgentChatRequest/Response`.

### Component Conventions

- Components are grouped by feature under `src/components/` (`dashboard/`, `agent/`, `playbooks/`, `layout/`).
- Each group has an `index.ts` barrel export.
- Use shadcn/ui (Radix) primitives for dialogs, tabs, dropdowns, toasts.
- Tailwind CSS only — no CSS modules or styled-components.
- Do not use inline styles.

### ESLint

`eslint . --max-warnings 0` — **zero warnings allowed**. CI will fail on any lint warning. Fix all lint issues before committing.

---

## API Reference

### Base URL
`http://localhost:8000/api/v1` (local) or `http://<node>:30800/api/v1` (K8s NodePort)

### Cluster Management
| Method | Path | Description |
|---|---|---|
| GET | `/clusters/` | List all clusters |
| POST | `/clusters/` | Create cluster |
| GET | `/clusters/{id}` | Get cluster detail |
| DELETE | `/clusters/{id}` | Delete cluster |

### Daily Health Check
| Method | Path | Description |
|---|---|---|
| POST | `/daily-check/run/{cluster_id}` | Trigger manual check |
| GET | `/daily-check/results/{cluster_id}` | All results for cluster |
| GET | `/daily-check/results/{cluster_id}/latest` | Latest result |
| GET | `/daily-check/summary` | All-cluster summary |
| PUT | `/daily-check/schedule/{cluster_id}` | Update check schedule |

### PromQL Metric Cards
| Method | Path | Description |
|---|---|---|
| GET | `/promql/cards` | List cards (filter: `category`, `enabled_only`) |
| POST | `/promql/cards` | Create card |
| PUT | `/promql/cards/{id}` | Update card |
| DELETE | `/promql/cards/{id}` | Delete card |
| GET | `/promql/query/{card_id}` | Execute card's PromQL |
| GET | `/promql/query/all` | Execute all enabled cards |
| POST | `/promql/query/test` | Test arbitrary PromQL |
| GET | `/promql/health` | Prometheus availability probe |

### AI Agent
| Method | Path | Description |
|---|---|---|
| POST | `/agent/chat` | Send question to Ollama LLM |
| GET | `/agent/health` | Ollama availability probe |
| POST | `/agent/pull-model` | Trigger model download |
| GET | `/agent/models` | List available models |

### App Health Probes (no `/api/v1` prefix)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/live` | K8s liveness probe |
| GET | `/health/ready` | K8s readiness probe (checks DB) |

---

## Database Schema

### Key Models

**`clusters`** — `id (UUID PK)`, `name`, `api_endpoint`, `kubeconfig_path`, `status (healthy/warning/critical)`, `created_at`, `updated_at`

**`daily_check_logs`** — `id`, `cluster_id (FK)`, `schedule_type`, `check_date`, `overall_status`, `api_server_status`, `api_server_response_time_ms`, `api_server_details (JSONB)`, `components_status (JSONB)`, `nodes_status (JSONB)`, `total_nodes`, `ready_nodes`, `system_pods_status (JSONB)`, `error_messages`, `warning_messages`, `check_duration_seconds`

**`check_schedules`** — `id`, `cluster_id (FK)`, `morning_time`, `noon_time`, `evening_time`, `morning_enabled`, `noon_enabled`, `evening_enabled`, `timezone`, `is_active`

**`addons`** — `id`, `cluster_id (FK)`, `name`, `type`, `icon`, `description`, `status`, `response_time`, `details (JSONB)`, `config (JSONB)`, `last_check`

**`metric_cards`** — `id`, `title`, `description`, `icon`, `promql`, `unit`, `display_type`, `category`, `thresholds`, `grafana_panel_url`, `sort_order`, `enabled`, `created_at`, `updated_at`

**`playbooks`** — `id`, `cluster_id (FK)`, `name`, `description`, `playbook_path`, `inventory_path`, `extra_vars (JSONB)`, `tags`, `status`, `show_on_dashboard`, `last_run_at`, `last_result (JSONB)`

---

## Deployment

### Phase 1 — Local (kind)

```bash
bash scripts/kind-setup.sh up      # build + deploy
bash scripts/kind-setup.sh reload  # after code changes
bash scripts/kind-setup.sh destroy # teardown
```

### Phase 2 — Air-gapped / Closed Network

```bash
bash scripts/deploy-airgap.sh all  # interactive: asks for registry, CLI, credentials
```

Helm values: `helm/k8s-daily-monitor/values-airgap.yaml`
Kustomize overlay: `k8s/overlays/airgap/`

### Phase 3 — Production (Jenkins + Helm + ArgoCD)

```bash
helm install k8s-monitor ./helm/k8s-daily-monitor \
  -f ./helm/k8s-daily-monitor/values-prod.yaml \
  -n k8s-monitor --create-namespace
```

See `docs/DEPLOY_GUIDE.md` for full details.

### Kubernetes Namespaces

| Environment | Namespace |
|---|---|
| dev | `k8s-monitor-dev` |
| prod | `k8s-monitor-prod` |

### Makefile Quick Reference

```bash
make help             # list all targets
make install          # pip install + npm install
make dev              # start backend + frontend (parallel)
make test             # pytest + npm run lint
make build            # npm run build
make clean            # remove build artifacts

make docker-up        # docker-compose up -d
make docker-down      # docker-compose down
make docker-rebuild   # full rebuild

make k8s-dev          # kubectl apply -k k8s/overlays/dev
make k8s-prod         # kubectl apply -k k8s/overlays/prod
make k8s-status       # show all k8s-monitor resources
make k8s-logs-dev     # tail dev logs
make skaffold-dev     # skaffold dev --profile=dev --port-forward
```

---

## CI/CD

### CI (`ci.yml`) — triggers on push/PR to `main` or `develop`

1. **Frontend**: `npm install` → lint → `tsc --noEmit` → `npm run build`
2. **Backend**: Python 3.11, `pip install -r requirements.txt` + `pytest pytest-asyncio httpx` → `pytest -v`
   - Requires: PostgreSQL 15 + Redis 7 service containers

### CD (`cd.yml`) — triggers on push to `main` or `workflow_dispatch`

1. Build + push Docker images to GHCR (`ghcr.io/<owner>/backend:<sha>`, `ghcr.io/<owner>/frontend:<sha>`)
2. `kustomize edit set image` to pin SHA tags
3. `kustomize build | kubectl apply -f -`
4. `kubectl rollout status` for backend, frontend, celery-worker

Required GitHub secrets: `KUBECONFIG_DEV`, `KUBECONFIG_PROD`

---

## Key Conventions

### Python

- Pydantic v2 (`model_dump()`, not `.dict()`).
- Async route handlers where I/O is involved; sync for DB-only operations via `Depends(get_db)`.
- Services are singletons instantiated at module level (e.g., `agent_service = AIAgentService()`).
- All external service calls must be fail-safe (catch all exceptions, return structured error dict).
- Use `subprocess.run(..., capture_output=True, text=True, timeout=30)` for kubectl calls.

### TypeScript / React

- Strict TypeScript — no `any` without an `eslint-disable` comment.
- All API response types defined in `src/types/index.ts`.
- Server state via TanStack Query hooks in `src/hooks/`.
- Client/UI state via Zustand stores in `src/stores/`.
- New UI components go in `src/components/<feature>/` with a barrel `index.ts`.

### Git

- Commit message convention: `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `chore: ...`
- Feature branches: `feature/<short-description>`
- PRs target `main`

### Adding a New Health Checker

1. Create `backend/app/services/checkers/my_checker.py` extending `base.BaseChecker`.
2. Call it from `DailyChecker.run_daily_check()` in `daily_checker.py`.
3. Add the result field to `DailyCheckLog` model and `_run_migrations()` if a new column is needed.
4. Expose the result in the daily-check router response schema.

### Adding a New Metric Card Category

Categories are free-form strings stored in `metric_cards.category`. Current values: `alert`, `resource`, `storage`, `network`. Add new ones as needed — they drive filtering in `GET /api/v1/promql/cards?category=<name>`.

---

## Troubleshooting

### Backend won't start — DB connection refused

Ensure PostgreSQL is running. With Docker Compose: `docker-compose up -d postgres`.

### Celery tasks not running

Check Redis: `redis-cli ping`. Check Beat is running: `celery -A app.celery_app beat --loglevel=info`.

### kubectl checks failing in Docker Compose

The backend container does not have `kubectl` or a kubeconfig by default in the Compose setup. K8s health checks work when deployed inside the cluster with the service account (`k8s/base/backend/serviceaccount.yaml`) or when a kubeconfig volume is mounted.

### Ollama model not available

```bash
# Trigger pull via API
curl -X POST http://localhost:8000/api/v1/agent/pull-model \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3"}'
```

### DB schema out of date

Add a column check to `_run_migrations()` in `backend/app/main.py` and restart the backend. The migration runs automatically on startup.

### PromQL cards show "offline"

Prometheus must be reachable at `PROMETHEUS_URL`. In local dev, Prometheus is not included in `docker-compose.yml` — set `PROMETHEUS_URL` to a reachable instance or deploy the full stack on K8s.
