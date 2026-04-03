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
    work_guide_router,
    ops_note_router,
    mindmap_router,
    management_server_router,
    infra_nodes_router,
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
            ("pod_cidr", "VARCHAR(255)"),
            ("pod_first_host", "VARCHAR(100)"),
            ("pod_last_host", "VARCHAR(100)"),
            ("svc_cidr", "VARCHAR(255)"),
            ("svc_first_host", "VARCHAR(100)"),
            ("svc_last_host", "VARCHAR(100)"),
            ("bond0_ip", "VARCHAR(100)"),
            ("bond0_mac", "VARCHAR(50)"),
            ("bond1_ip", "VARCHAR(100)"),
            ("bond1_mac", "VARCHAR(50)"),
            ("bgp_enabled", "BOOLEAN DEFAULT FALSE"),
            ("as_number", "VARCHAR(20)"),
        ]
        for col_name, col_type in new_cluster_cols:
            if col_name not in columns:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE clusters ADD COLUMN {col_name} {col_type}"))
    if "issues" in inspector.get_table_names():
        issue_cols = [col["name"] for col in inspector.get_columns("issues")]
        if "detail_content" not in issue_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE issues ADD COLUMN detail_content TEXT"))
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
        # 워크플로 노드 연계 컬럼
        for col_name, col_type in [("reference_type", "VARCHAR(50)"), ("reference_id", "VARCHAR(100)")]:
            if col_name not in wf_step_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE workflow_steps ADD COLUMN {col_name} {col_type}"))
    # tasks: Date → DateTime 마이그레이션 + 칸반 보드 필드 추가
    if "tasks" in inspector.get_table_names():
        task_col_map = {col["name"]: col["type"].__class__.__name__ for col in inspector.get_columns("tasks")}
        for col_name in ("scheduled_at", "completed_at"):
            if col_name in task_col_map and task_col_map[col_name].upper() == "DATE":
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE tasks ALTER COLUMN {col_name} TYPE TIMESTAMP WITHOUT TIME ZONE "
                        f"USING {col_name}::TIMESTAMP WITHOUT TIME ZONE"
                    ))
        # 칸반 보드 신규 컬럼
        task_cols = list(task_col_map.keys())
        kanban_status_is_new = "kanban_status" not in task_cols
        new_task_kanban_cols = [
            ("kanban_status", "VARCHAR(20) NOT NULL DEFAULT 'todo'"),
            ("module", "VARCHAR(50)"),
            ("type_label", "VARCHAR(20)"),
            ("effort_hours", "INTEGER"),
            ("done_condition", "TEXT"),
        ]
        for col_name, col_type in new_task_kanban_cols:
            if col_name not in task_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}"))
        # 기존 completed_at 있는 레코드 → done 으로 동기화 (최초 마이그레이션 1회만)
        if kanban_status_is_new:
            with engine.begin() as conn:
                conn.execute(text("UPDATE tasks SET kanban_status = 'done' WHERE completed_at IS NOT NULL"))
        # Task: parent_id for sub-tasks
        if "parent_id" not in task_cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE tasks ADD COLUMN parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE'))
            import logging as _logging
            _logging.getLogger(__name__).info("Migration: added tasks.parent_id")
    # issues: Date → DateTime 마이그레이션
    if "issues" in inspector.get_table_names():
        issue_col_map = {col["name"]: col["type"].__class__.__name__ for col in inspector.get_columns("issues")}
        for col_name in ("occurred_at", "resolved_at"):
            if col_name in issue_col_map and issue_col_map[col_name].upper() == "DATE":
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE issues ALTER COLUMN {col_name} TYPE TIMESTAMP WITHOUT TIME ZONE "
                        f"USING {col_name}::TIMESTAMP WITHOUT TIME ZONE"
                    ))


    # clusters: statusenum 에 'pending' 값 추가 (PostgreSQL enum 확장)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TYPE statusenum ADD VALUE IF NOT EXISTS 'pending'"))
    except Exception:
        pass  # 이미 존재하거나 enum 이름이 다를 경우 무시

    # infra_nodes: 물리 서버 노드 테이블 생성
    if "infra_nodes" not in inspector.get_table_names():
        with engine.begin() as conn:
            conn.execute(text('''
                CREATE TABLE infra_nodes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
                    hostname VARCHAR(255) NOT NULL,
                    rack_name VARCHAR(100),
                    ip_address VARCHAR(45),
                    role VARCHAR(20) NOT NULL DEFAULT \'worker\',
                    cpu_cores INTEGER,
                    ram_gb INTEGER,
                    disk_gb INTEGER,
                    os_info VARCHAR(200),
                    switch_name VARCHAR(100),
                    notes TEXT,
                    auto_synced BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            '''))


    # infra_node_sync_histories: 노드/토폴로지 동기화 이력 테이블 생성
    if "infra_node_sync_histories" not in inspector.get_table_names():
        with engine.begin() as conn:
            conn.execute(text('''
                CREATE TABLE infra_node_sync_histories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
                    node_id UUID REFERENCES infra_nodes(id) ON DELETE SET NULL,
                    sync_type VARCHAR(30) NOT NULL,
                    source VARCHAR(30) NOT NULL,
                    action VARCHAR(20) NOT NULL,
                    confidence INTEGER NOT NULL DEFAULT 50,
                    priority INTEGER NOT NULL DEFAULT 50,
                    message TEXT,
                    before_data JSONB,
                    after_data JSONB,
                    conflict_fields JSONB,
                    synced_at TIMESTAMP DEFAULT NOW()
                )
            '''))

    # work_guides: 계층 구조 + 정렬 컬럼 추가
    if "work_guides" in inspector.get_table_names():
        wg_cols = [col["name"] for col in inspector.get_columns("work_guides")]
        for col_name, col_type in [
            ("parent_id", "UUID"),
            ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col_name not in wg_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE work_guides ADD COLUMN {col_name} {col_type}"))


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
app.include_router(work_guide_router, prefix="/api/v1")
app.include_router(ops_note_router, prefix="/api/v1")
app.include_router(mindmap_router, prefix="/api/v1")
app.include_router(management_server_router, prefix="/api/v1")
app.include_router(infra_nodes_router, prefix="/api/v1")


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
