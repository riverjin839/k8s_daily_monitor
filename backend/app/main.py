import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.routers import (
    agent_router,
    clusters_router,
    daily_check_router,
    health_router,
    history_router,
    issues_router,
    node_labels_router,
    openclaw_router,
    playbooks_router,
    promql_router,
    tasks_router,
    ui_settings_router,
    workflows_router,
)


def _run_migrations():
    """기존 테이블에 누락된 컬럼 추가 (경량 마이그레이션)"""
    inspector = inspect(engine)
    if "addons" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("addons")]
        if "details" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE addons ADD COLUMN details JSONB"))
        if "config" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE addons ADD COLUMN config JSONB"))
    if "playbooks" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("playbooks")]
        if "show_on_dashboard" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE playbooks ADD COLUMN show_on_dashboard BOOLEAN DEFAULT FALSE"))
    if "clusters" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("clusters")]
        new_cluster_cols = [
            ("region", "VARCHAR(100)"),
            ("operation_level", "VARCHAR(50)"),
            ("max_pod", "INTEGER"),
            ("cilium_config", "TEXT"),
            ("cidr", "VARCHAR(255)"),
            ("first_host", "VARCHAR(100)"),
            ("last_host", "VARCHAR(100)"),
            ("description", "TEXT"),
            ("node_count", "INTEGER"),
            ("hostname", "VARCHAR(255)"),
        ]
        for col_name, col_type in new_cluster_cols:
            if col_name not in columns:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE clusters ADD COLUMN {col_name} {col_type}"))
    if "workflow_steps" in inspector.get_table_names():
        wf_step_cols = [col["name"] for col in inspector.get_columns("workflow_steps")]
        for col_name, col_type, default in [
            ("step_type", "VARCHAR(50)", "'action'"),
            ("status", "VARCHAR(20)", "'idle'"),
        ]:
            if col_name not in wf_step_cols:
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE workflow_steps ADD COLUMN {col_name} {col_type} NOT NULL DEFAULT {default}"
                    ))


def _seed_default_metric_cards():
    """Seed default PromQL metric cards if the table is empty."""
    from app.models.metric_card import MetricCard

    db = SessionLocal()
    try:
        if db.query(MetricCard).count() > 0:
            return  # already seeded

        defaults = [
            MetricCard(
                title="CrashLoopBackOff Pods",
                description="Number of pods stuck in CrashLoopBackOff",
                icon="🚨",
                promql='sum(kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"}) OR on() vector(0)',
                unit="count",
                display_type="value",
                category="alert",
                thresholds="warning:1,critical:3",
                sort_order=0,
            ),
            MetricCard(
                title="Failed Pods",
                description="Number of pods in Failed phase",
                icon="💀",
                promql='sum(kube_pod_status_phase{phase="Failed"}) OR on() vector(0)',
                unit="count",
                display_type="value",
                category="alert",
                thresholds="warning:1,critical:5",
                sort_order=1,
            ),
            MetricCard(
                title="Cluster CPU Usage",
                description="Overall cluster CPU utilization",
                icon="⚡",
                promql='100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
                unit="%",
                display_type="gauge",
                category="resource",
                thresholds="warning:70,critical:90",
                sort_order=2,
            ),
            MetricCard(
                title="Cluster Memory Usage",
                description="Overall cluster memory utilization",
                icon="🧠",
                promql="100 * (1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)))",
                unit="%",
                display_type="gauge",
                category="resource",
                thresholds="warning:75,critical:90",
                sort_order=3,
            ),
            MetricCard(
                title="PVC Disk Usage > 80%",
                description="Persistent volumes nearing capacity",
                icon="💾",
                promql="(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) * 100 > 80",
                unit="%",
                display_type="list",
                category="storage",
                thresholds="warning:80,critical:95",
                sort_order=4,
            ),
            MetricCard(
                title="Inbound Network Traffic",
                description="Cluster-wide inbound traffic rate",
                icon="🌐",
                promql="sum(rate(container_network_receive_bytes_total[5m]))",
                unit="bytes/s",
                display_type="value",
                category="network",
                sort_order=5,
            ),
        ]

        db.add_all(defaults)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: DB 테이블 생성
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _seed_default_metric_cards()
    yield
    # Shutdown: 필요한 정리 작업


# FastAPI 앱 생성
app = FastAPI(
    title=settings.app_name,
    description="DevOps K8s Daily Monitoring Dashboard API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS 설정 - Kubernetes 환경 지원
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://frontend",
    "http://frontend:80",
]

# 환경변수로 추가 origin 설정 가능
extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if extra_origins:
    allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(clusters_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api/v1")
app.include_router(history_router, prefix="/api/v1")
app.include_router(daily_check_router, prefix="/api/v1")
app.include_router(playbooks_router, prefix="/api/v1")
app.include_router(agent_router, prefix="/api/v1")
app.include_router(promql_router, prefix="/api/v1")
app.include_router(openclaw_router, prefix="/api/v1")
app.include_router(issues_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(ui_settings_router, prefix="/api/v1")
app.include_router(node_labels_router, prefix="/api/v1")
app.include_router(workflows_router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Kubernetes liveness/readiness probe endpoint"""
    return {"status": "healthy"}


@app.get("/health/live")
def liveness_check():
    """Kubernetes liveness probe - checks if app is running"""
    return {"status": "alive"}


@app.get("/health/ready")
def readiness_check():
    """Kubernetes readiness probe - checks if app is ready to serve traffic"""
    try:
        # Check database connection
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return {"status": "not_ready", "database": "disconnected", "error": str(e)}
