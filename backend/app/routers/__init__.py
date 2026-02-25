from app.routers.clusters import router as clusters_router
from app.routers.health import router as health_router
from app.routers.history import router as history_router
from app.routers.daily_check import router as daily_check_router
from app.routers.playbooks import router as playbooks_router
from app.routers.agent import router as agent_router
from app.routers.promql import router as promql_router
from app.routers.openclaw import router as openclaw_router
from app.routers.issues import router as issues_router
from app.routers.tasks import router as tasks_router

__all__ = [
    "clusters_router",
    "health_router",
    "history_router",
    "daily_check_router",
    "playbooks_router",
    "agent_router",
    "promql_router",
    "openclaw_router",
    "issues_router",
    "tasks_router",
]
