"""
Checker Registry - 체커 자동 등록 및 관리
"""
from typing import Dict, List, Type, Optional
from app.checkers.base import BaseChecker, ClusterConfig, CheckResult


class CheckerRegistry:
    """
    체커 레지스트리

    모든 체커를 등록하고 관리합니다.
    새로운 체커는 register() 또는 데코레이터로 등록 가능.

    사용 예:
    ```python
    registry = CheckerRegistry()
    registry.register(APIServerChecker)

    # 또는 데코레이터
    @registry.checker
    class MyChecker(BaseChecker):
        ...

    # 모든 체커 실행
    results = await registry.run_all(config)
    ```
    """

    def __init__(self):
        self._checkers: Dict[str, Type[BaseChecker]] = {}

    def register(self, checker_class: Type[BaseChecker]) -> Type[BaseChecker]:
        """체커 클래스 등록"""
        if not issubclass(checker_class, BaseChecker):
            raise TypeError(f"{checker_class} must be a subclass of BaseChecker")

        name = checker_class.name
        self._checkers[name] = checker_class
        return checker_class

    def checker(self, cls: Type[BaseChecker]) -> Type[BaseChecker]:
        """데코레이터로 체커 등록"""
        return self.register(cls)

    def get(self, name: str) -> Optional[Type[BaseChecker]]:
        """이름으로 체커 클래스 조회"""
        return self._checkers.get(name)

    def get_instance(self, name: str) -> Optional[BaseChecker]:
        """이름으로 체커 인스턴스 생성"""
        checker_class = self.get(name)
        if checker_class:
            return checker_class()
        return None

    def list_all(self) -> List[str]:
        """등록된 모든 체커 이름 목록"""
        return list(self._checkers.keys())

    def list_by_category(self, category: str) -> List[str]:
        """카테고리별 체커 목록"""
        return [
            name for name, cls in self._checkers.items()
            if cls.category == category
        ]

    def get_all_instances(self, enabled_only: bool = True) -> List[BaseChecker]:
        """모든 체커 인스턴스 생성"""
        instances = []
        for checker_class in self._checkers.values():
            instance = checker_class()
            if enabled_only and not instance.enabled:
                continue
            instances.append(instance)
        return instances

    async def run_all(
        self,
        config: ClusterConfig,
        enabled_only: bool = True
    ) -> Dict[str, CheckResult]:
        """
        모든 체커 실행

        Args:
            config: 클러스터 설정
            enabled_only: 활성화된 체커만 실행

        Returns:
            Dict[str, CheckResult]: 체커 이름별 결과
        """
        results = {}
        checkers = self.get_all_instances(enabled_only)

        for checker in checkers:
            result = await checker.run(config)
            results[checker.name] = result

        return results

    async def run_by_names(
        self,
        config: ClusterConfig,
        names: List[str]
    ) -> Dict[str, CheckResult]:
        """
        지정된 체커만 실행

        Args:
            config: 클러스터 설정
            names: 실행할 체커 이름 목록

        Returns:
            Dict[str, CheckResult]: 체커 이름별 결과
        """
        results = {}

        for name in names:
            checker = self.get_instance(name)
            if checker:
                result = await checker.run(config)
                results[name] = result

        return results

    async def run_by_category(
        self,
        config: ClusterConfig,
        category: str
    ) -> Dict[str, CheckResult]:
        """
        카테고리별 체커 실행

        Args:
            config: 클러스터 설정
            category: 체커 카테고리 (core, storage, networking, monitoring, cicd)

        Returns:
            Dict[str, CheckResult]: 체커 이름별 결과
        """
        names = self.list_by_category(category)
        return await self.run_by_names(config, names)

    def info(self) -> List[dict]:
        """등록된 체커 정보 목록"""
        return [
            {
                "name": cls.name,
                "description": cls.description,
                "category": cls.category,
                "icon": cls.icon,
                "enabled": cls.enabled,
            }
            for cls in self._checkers.values()
        ]


# 글로벌 레지스트리 인스턴스
default_registry = CheckerRegistry()


def get_registry() -> CheckerRegistry:
    """기본 레지스트리 반환"""
    return default_registry
