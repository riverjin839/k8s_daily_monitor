import subprocess
from datetime import datetime
from uuid import UUID
from sqlalchemy.orm import Session

from app.models import Cluster, Addon, CheckLog, StatusEnum
from app.config import settings
from app.services.checkers import CHECKER_REGISTRY, CheckResult


class HealthChecker:
    def __init__(self, db: Session):
        self.db = db

    def run_check(self, cluster_id: UUID) -> None:
        """클러스터 전체 헬스 체크 실행"""
        cluster = self.db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return

        addons = self.db.query(Addon).filter(Addon.cluster_id == cluster_id).all()
        overall_status = StatusEnum.healthy

        for addon in addons:
            result = self._dispatch(cluster, addon)

            # 애드온 상태 업데이트
            addon.status = result.status
            addon.response_time = result.response_time
            addon.last_check = datetime.utcnow()
            if result.details:
                addon.details = result.details

            # 로그 기록
            log = CheckLog(
                cluster_id=cluster_id,
                addon_id=addon.id,
                status=result.status,
                message=result.message,
                raw_output={"response_time": result.response_time, **(result.details or {})},
            )
            self.db.add(log)

            # 전체 상태 계산
            if result.status == StatusEnum.critical:
                overall_status = StatusEnum.critical
            elif result.status == StatusEnum.warning and overall_status != StatusEnum.critical:
                overall_status = StatusEnum.warning

        # 클러스터 상태 업데이트
        cluster.status = overall_status
        cluster.updated_at = datetime.utcnow()

        cluster_log = CheckLog(
            cluster_id=cluster_id,
            status=overall_status,
            message=f"Cluster check completed - Status: {overall_status.value}",
        )
        self.db.add(cluster_log)
        self.db.commit()

    def _dispatch(self, cluster: Cluster, addon: Addon) -> CheckResult:
        """addon.type에 맞는 Checker를 찾아 실행 (Strategy Pattern)."""
        checker_cls = CHECKER_REGISTRY.get(addon.type)
        if checker_cls:
            return checker_cls(cluster, addon).safe_check()

        # fallback: ansible playbook 또는 HTTP 체크
        try:
            if addon.check_playbook:
                s, m, t, d = self._run_ansible_check(cluster, addon)
            else:
                s, m, t, d = self._run_http_check(cluster, addon)
            return CheckResult(status=s, message=m, response_time=t, details=d)
        except Exception as e:
            return CheckResult(
                status=StatusEnum.critical,
                message=f"Check failed: {str(e)[:200]}",
            )

    # ── Legacy fallback methods ────────────────────────────

    def _run_ansible_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int, dict | None]:
        playbook_path = f"{settings.ansible_playbook_dir}/{addon.check_playbook}"
        try:
            start = datetime.utcnow()
            result = subprocess.run(
                [
                    "ansible-playbook", playbook_path,
                    "-i", f"{settings.ansible_inventory_dir}/clusters.yml",
                    "-e", f"target_cluster={cluster.name}",
                    "-e", f"api_endpoint={cluster.api_endpoint}",
                ],
                capture_output=True, text=True,
                timeout=settings.check_timeout_seconds,
            )
            elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)

            # stdout에서 핵심 메시지 추출
            output = result.stdout.strip().split("\n")[-1] if result.stdout else ""
            if "PLAY RECAP" in output:
                output = "Check completed"
            details = {"result": output} if output else None

            if result.returncode == 0:
                msg = output or f"{addon.name} check passed"
                return StatusEnum.healthy, msg, elapsed, details
            return StatusEnum.warning, f"{addon.name} failed: {result.stderr[:200]}", elapsed, details
        except subprocess.TimeoutExpired:
            return StatusEnum.critical, f"{addon.name} timed out", settings.check_timeout_seconds * 1000, None
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} error: {str(e)}", 0, None

    def _run_http_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int, dict | None]:
        import httpx

        endpoint_map = {"API Server": "/healthz", "etcd": "/health", "Metrics Server": "/metrics"}
        endpoint = endpoint_map.get(addon.name, "/healthz")
        url = f"{cluster.api_endpoint}{endpoint}"

        try:
            start = datetime.utcnow()
            with httpx.Client(verify=False, timeout=10.0) as client:
                response = client.get(url)
            elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)

            details = {"endpoint": endpoint, "status_code": response.status_code}

            if response.status_code == 200:
                if elapsed > 3000:
                    return StatusEnum.warning, f"{addon.name} slow ({elapsed}ms)", elapsed, details
                return StatusEnum.healthy, f"{addon.name} healthy ({elapsed}ms)", elapsed, details
            return StatusEnum.warning, f"{addon.name} returned {response.status_code}", elapsed, details
        except httpx.TimeoutException:
            return StatusEnum.critical, f"{addon.name} timeout", 10000, {"endpoint": endpoint}
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} failed: {str(e)}", 0, None
