"""
일일 K8s 클러스터 헬스 체크 서비스 (Plugin 기반)

체커 플러그인 시스템을 사용하여 각 컴포넌트 체크 수행:
- API 서버, etcd, Components, Nodes, System Pods, MinIO 등
"""
import time
from datetime import datetime
from typing import Optional, List, Dict

from sqlalchemy.orm import Session

from app.models import Cluster, DailyCheckLog, CheckScheduleType, StatusEnum
from app.checkers import get_registry, ClusterConfig, CheckStatus, CheckResult


class DailyChecker:
    """
    일일 헬스 체크 서비스

    Plugin 기반 체커 시스템을 사용하여 클러스터 상태 체크
    """

    def __init__(self, db: Session):
        self.db = db
        self.registry = get_registry()

    async def run_daily_check(
        self,
        cluster_id: str,
        schedule_type: CheckScheduleType = CheckScheduleType.manual,
        checker_names: Optional[List[str]] = None
    ) -> DailyCheckLog:
        """
        일일 체크 실행

        Args:
            cluster_id: 클러스터 ID
            schedule_type: 스케줄 타입 (morning, noon, evening, manual)
            checker_names: 실행할 체커 이름 목록 (None이면 모두 실행)

        Returns:
            DailyCheckLog: 체크 결과 로그
        """
        start_time = time.time()

        # 클러스터 조회
        cluster = self.db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise ValueError(f"Cluster not found: {cluster_id}")

        # ClusterConfig 생성
        config = ClusterConfig(
            name=cluster.name,
            api_endpoint=cluster.api_endpoint,
            kubeconfig_path=cluster.kubeconfig_path,
        )

        # 체커 실행
        if checker_names:
            results = await self.registry.run_by_names(config, checker_names)
        else:
            results = await self.registry.run_all(config)

        # 결과 분석
        check_log = self._create_check_log(
            cluster=cluster,
            schedule_type=schedule_type,
            results=results,
            duration=int(time.time() - start_time)
        )

        # DB 저장
        self.db.add(check_log)

        # 클러스터 상태 업데이트
        cluster.status = check_log.overall_status
        cluster.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(check_log)

        return check_log

    def _create_check_log(
        self,
        cluster: Cluster,
        schedule_type: CheckScheduleType,
        results: Dict[str, CheckResult],
        duration: int
    ) -> DailyCheckLog:
        """체크 결과로 DailyCheckLog 생성"""

        # API Server 결과
        api_result = results.get("api-server")
        api_status = self._to_status_enum(api_result.status) if api_result else StatusEnum.critical

        # Components 결과 (etcd 포함)
        components_status = {}
        for name in ["components", "etcd"]:
            if name in results:
                components_status[name] = results[name].to_dict()

        # Nodes 결과
        nodes_result = results.get("nodes")
        nodes_status = nodes_result.details.get("nodes") if nodes_result else None
        total_nodes = nodes_result.details.get("total_nodes", 0) if nodes_result else 0
        ready_nodes = nodes_result.details.get("ready_nodes", 0) if nodes_result else 0

        # System Pods 결과
        pods_result = results.get("system-pods")
        system_pods_status = pods_result.details.get("pods") if pods_result else None

        # 전체 상태 결정
        overall_status = self._determine_overall_status(results)

        # 에러/경고 메시지 수집
        errors, warnings = self._collect_messages(results)

        return DailyCheckLog(
            cluster_id=cluster.id,
            schedule_type=schedule_type,
            check_date=datetime.utcnow(),
            overall_status=overall_status,
            # API Server
            api_server_status=api_status,
            api_server_response_time_ms=api_result.response_time_ms if api_result else None,
            api_server_details=api_result.details if api_result else None,
            # Components
            components_status=components_status,
            # Nodes
            nodes_status=nodes_status,
            total_nodes=total_nodes,
            ready_nodes=ready_nodes,
            # System Pods
            system_pods_status=system_pods_status,
            # 에러/경고
            error_messages=errors if errors else None,
            warning_messages=warnings if warnings else None,
            # 메타
            check_duration_seconds=duration,
        )

    def _determine_overall_status(self, results: Dict[str, CheckResult]) -> StatusEnum:
        """전체 상태 결정"""
        has_critical = False
        has_warning = False

        for result in results.values():
            if result.status == CheckStatus.critical:
                has_critical = True
            elif result.status == CheckStatus.warning:
                has_warning = True

        if has_critical:
            return StatusEnum.critical
        elif has_warning:
            return StatusEnum.warning
        else:
            return StatusEnum.healthy

    def _collect_messages(self, results: Dict[str, CheckResult]) -> tuple:
        """에러/경고 메시지 수집"""
        errors = []
        warnings = []

        for name, result in results.items():
            if result.status == CheckStatus.critical:
                errors.append(f"[{name}] {result.message}")
            elif result.status == CheckStatus.warning:
                warnings.append(f"[{name}] {result.message}")

        return errors, warnings

    def _to_status_enum(self, check_status: CheckStatus) -> StatusEnum:
        """CheckStatus를 StatusEnum으로 변환"""
        mapping = {
            CheckStatus.healthy: StatusEnum.healthy,
            CheckStatus.warning: StatusEnum.warning,
            CheckStatus.critical: StatusEnum.critical,
            CheckStatus.unknown: StatusEnum.warning,
        }
        return mapping.get(check_status, StatusEnum.critical)

    def get_available_checkers(self) -> list:
        """사용 가능한 체커 목록 반환"""
        return self.registry.info()
