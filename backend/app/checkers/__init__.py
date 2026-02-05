"""
K8s Daily Monitor - Component Checkers

플러그인 기반 컴포넌트 체크 시스템

사용법:
```python
from app.checkers import get_registry, ClusterConfig

registry = get_registry()
config = ClusterConfig(
    name="my-cluster",
    api_endpoint="https://10.61.162.101:6443"
)

# 모든 체커 실행
results = await registry.run_all(config)

# 특정 체커만 실행
results = await registry.run_by_names(config, ["api-server", "nodes"])

# 카테고리별 실행
results = await registry.run_by_category(config, "core")
```

새 체커 추가:
```python
from app.checkers import BaseChecker, CheckResult, CheckStatus, ClusterConfig

class MyChecker(BaseChecker):
    name = "my-component"
    description = "My Component"
    category = "storage"
    icon = "💾"

    async def check(self, config: ClusterConfig) -> CheckResult:
        # 체크 로직 구현
        return CheckResult(
            status=CheckStatus.healthy,
            message="OK"
        )

# 레지스트리에 등록
from app.checkers import get_registry
get_registry().register(MyChecker)
```
"""

from app.checkers.base import (
    BaseChecker,
    CheckResult,
    CheckStatus,
    ClusterConfig,
)
from app.checkers.registry import (
    CheckerRegistry,
    get_registry,
    default_registry,
)

# 기본 체커 임포트 및 등록
from app.checkers.api_server import APIServerChecker
from app.checkers.etcd import EtcdChecker
from app.checkers.components import ComponentsChecker
from app.checkers.nodes import NodesChecker
from app.checkers.system_pods import SystemPodsChecker
from app.checkers.minio import MinIOChecker

# 기본 체커 등록
default_registry.register(APIServerChecker)
default_registry.register(EtcdChecker)
default_registry.register(ComponentsChecker)
default_registry.register(NodesChecker)
default_registry.register(SystemPodsChecker)
default_registry.register(MinIOChecker)


__all__ = [
    # Base
    "BaseChecker",
    "CheckResult",
    "CheckStatus",
    "ClusterConfig",
    # Registry
    "CheckerRegistry",
    "get_registry",
    "default_registry",
    # Checkers
    "APIServerChecker",
    "EtcdChecker",
    "ComponentsChecker",
    "NodesChecker",
    "SystemPodsChecker",
    "MinIOChecker",
]
