"""
Base Checker - 모든 컴포넌트 체커의 추상 기본 클래스
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Any


class CheckStatus(str, Enum):
    """체크 결과 상태"""
    healthy = "healthy"
    warning = "warning"
    critical = "critical"
    unknown = "unknown"


@dataclass
class CheckResult:
    """체크 결과 데이터 클래스"""
    status: CheckStatus
    message: str
    response_time_ms: Optional[int] = None
    details: dict = field(default_factory=dict)
    checked_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "message": self.message,
            "response_time_ms": self.response_time_ms,
            "details": self.details,
            "checked_at": self.checked_at.isoformat(),
        }


@dataclass
class ClusterConfig:
    """클러스터 설정 정보"""
    name: str
    api_endpoint: str
    kubeconfig_path: Optional[str] = None

    # 컴포넌트별 추가 설정
    minio_endpoint: Optional[str] = None
    minio_access_key: Optional[str] = None
    minio_secret_key: Optional[str] = None

    etcd_endpoints: Optional[list] = None

    argocd_endpoint: Optional[str] = None

    registry_endpoint: Optional[str] = None


class BaseChecker(ABC):
    """
    컴포넌트 체커 기본 클래스

    새로운 컴포넌트 추가 시 이 클래스를 상속받아 구현:

    ```python
    class MyComponentChecker(BaseChecker):
        name = "my-component"
        description = "My Component Health Check"
        category = "storage"
        icon = "💾"

        async def check(self, config: ClusterConfig) -> CheckResult:
            # 체크 로직 구현
            ...
    ```
    """

    # 체커 메타 정보 (서브클래스에서 오버라이드)
    name: str = "base"
    description: str = "Base Checker"
    category: str = "core"  # core, storage, networking, monitoring, cicd
    icon: str = "🔍"

    # 체크 설정
    timeout_seconds: int = 30
    warning_threshold_ms: int = 3000  # 3초 이상이면 warning

    # 활성화 여부
    enabled: bool = True

    def __init__(self):
        self._last_result: Optional[CheckResult] = None

    @abstractmethod
    async def check(self, config: ClusterConfig) -> CheckResult:
        """
        컴포넌트 헬스 체크 수행

        Args:
            config: 클러스터 설정 정보

        Returns:
            CheckResult: 체크 결과
        """
        pass

    async def run(self, config: ClusterConfig) -> CheckResult:
        """
        체크 실행 (with 예외 처리)
        """
        try:
            result = await self.check(config)
            self._last_result = result
            return result
        except Exception as e:
            result = CheckResult(
                status=CheckStatus.critical,
                message=f"Check failed: {str(e)}",
                details={"error": str(e), "error_type": type(e).__name__}
            )
            self._last_result = result
            return result

    @property
    def last_result(self) -> Optional[CheckResult]:
        """마지막 체크 결과"""
        return self._last_result

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(name={self.name}, enabled={self.enabled})>"
