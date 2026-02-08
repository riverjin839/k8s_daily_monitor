"""ArgoCDChecker: ArgoCD Application CRD sync/health status via K8s API."""
from datetime import datetime

from kubernetes import client

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class ArgoCDChecker(BaseChecker):
    """ArgoCD: Application CRD 전체의 Sync/Health 상태 집계."""

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        cfg = self.addon.config or {}
        namespace = cfg.get("namespace", "argocd")

        v1 = self._get_k8s_client()
        api = client.CustomObjectsApi(v1.api_client)

        try:
            result = api.list_namespaced_custom_object(
                group="argoproj.io",
                version="v1alpha1",
                namespace=namespace,
                plural="applications",
            )
        except client.ApiException as e:
            elapsed = self._elapsed_ms(start)
            return CheckResult(
                StatusEnum.critical,
                f"Failed to list ArgoCD apps: {e.status} {e.reason}",
                elapsed,
                {"error": str(e)[:300], "namespace": namespace},
            )

        apps = result.get("items", [])
        total = len(apps)

        synced = 0
        out_of_sync = 0
        degraded = 0
        healthy = 0
        missing = 0
        progressing = 0
        app_details = []

        for app in apps:
            name = app.get("metadata", {}).get("name", "?")
            status_block = app.get("status", {})
            sync_status = status_block.get("sync", {}).get("status", "Unknown")
            health_status = status_block.get("health", {}).get("status", "Unknown")

            if sync_status == "Synced":
                synced += 1
            elif sync_status == "OutOfSync":
                out_of_sync += 1

            if health_status == "Healthy":
                healthy += 1
            elif health_status == "Degraded":
                degraded += 1
            elif health_status == "Missing":
                missing += 1
            elif health_status == "Progressing":
                progressing += 1

            # 문제 있는 앱만 상세에 포함
            if sync_status != "Synced" or health_status not in ("Healthy", "Progressing"):
                app_details.append({
                    "name": name,
                    "sync": sync_status,
                    "health": health_status,
                })

        elapsed = self._elapsed_ms(start)
        details = {
            "total_apps": total,
            "synced": synced,
            "out_of_sync": out_of_sync,
            "healthy": healthy,
            "degraded": degraded,
            "missing": missing,
            "progressing": progressing,
            "problem_apps": app_details[:10],
            "namespace": namespace,
        }

        if degraded > 0:
            return CheckResult(
                StatusEnum.critical,
                f"ArgoCD: {degraded} degraded, {out_of_sync} out-of-sync (total {total})",
                elapsed,
                details,
            )

        if out_of_sync > 0 or missing > 0:
            return CheckResult(
                StatusEnum.warning,
                f"ArgoCD: {out_of_sync} out-of-sync, {missing} missing (total {total})",
                elapsed,
                details,
            )

        return CheckResult(
            StatusEnum.healthy,
            f"ArgoCD: {total} apps all synced & healthy",
            elapsed,
            details,
        )
