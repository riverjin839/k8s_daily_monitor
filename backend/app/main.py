import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.routers import clusters_router, health_router, history_router, daily_check_router, playbooks_router


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: DB 테이블 생성
    Base.metadata.create_all(bind=engine)
    _run_migrations()
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
