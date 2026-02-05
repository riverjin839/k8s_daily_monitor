import subprocess
import json
from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Cluster, Addon, CheckLog, StatusEnum
from app.config import settings


class HealthChecker:
    def __init__(self, db: Session):
        self.db = db
    
    def run_check(self, cluster_id: UUID) -> None:
        """클러스터 전체 헬스 체크 실행"""
        cluster = self.db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return
        
        # 클러스터의 모든 애드온 점검
        addons = self.db.query(Addon).filter(Addon.cluster_id == cluster_id).all()
        
        overall_status = StatusEnum.healthy
        
        for addon in addons:
            status, message, response_time = self._check_addon(cluster, addon)
            
            # 애드온 상태 업데이트
            addon.status = status
            addon.response_time = response_time
            addon.last_check = datetime.utcnow()
            
            # 로그 기록
            log = CheckLog(
                cluster_id=cluster_id,
                addon_id=addon.id,
                status=status,
                message=message,
                raw_output={"response_time": response_time}
            )
            self.db.add(log)
            
            # 전체 상태 계산
            if status == StatusEnum.critical:
                overall_status = StatusEnum.critical
            elif status == StatusEnum.warning and overall_status != StatusEnum.critical:
                overall_status = StatusEnum.warning
        
        # 클러스터 상태 업데이트
        cluster.status = overall_status
        cluster.updated_at = datetime.utcnow()
        
        # 전체 점검 로그
        cluster_log = CheckLog(
            cluster_id=cluster_id,
            status=overall_status,
            message=f"Cluster check completed - Status: {overall_status.value}",
        )
        self.db.add(cluster_log)
        
        self.db.commit()
    
    def _check_addon(self, cluster: Cluster, addon: Addon) -> tuple[StatusEnum, str, int]:
        """개별 애드온 점검"""
        try:
            # Ansible playbook 실행
            if addon.check_playbook:
                return self._run_ansible_check(cluster, addon)
            else:
                # 기본 HTTP 체크
                return self._run_http_check(cluster, addon)
        except Exception as e:
            return StatusEnum.critical, f"Check failed: {str(e)}", 0
    
    def _run_ansible_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int]:
        """Ansible playbook으로 점검"""
        playbook_path = f"{settings.ansible_playbook_dir}/{addon.check_playbook}"
        
        try:
            start_time = datetime.utcnow()
            
            result = subprocess.run(
                [
                    "ansible-playbook",
                    playbook_path,
                    "-i", f"{settings.ansible_inventory_dir}/clusters.yml",
                    "-e", f"target_cluster={cluster.name}",
                    "-e", f"api_endpoint={cluster.api_endpoint}",
                ],
                capture_output=True,
                text=True,
                timeout=settings.check_timeout_seconds
            )
            
            end_time = datetime.utcnow()
            response_time = int((end_time - start_time).total_seconds() * 1000)
            
            if result.returncode == 0:
                return StatusEnum.healthy, f"{addon.name} check passed", response_time
            else:
                return StatusEnum.warning, f"{addon.name} check failed: {result.stderr[:200]}", response_time
                
        except subprocess.TimeoutExpired:
            return StatusEnum.critical, f"{addon.name} check timed out", settings.check_timeout_seconds * 1000
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} check error: {str(e)}", 0
    
    def _run_http_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int]:
        """HTTP 헬스체크"""
        import httpx
        
        # 애드온별 엔드포인트 매핑
        endpoint_map = {
            "API Server": "/healthz",
            "etcd": "/health",
            "Metrics Server": "/metrics",
        }
        
        endpoint = endpoint_map.get(addon.name, "/healthz")
        url = f"{cluster.api_endpoint}{endpoint}"
        
        try:
            start_time = datetime.utcnow()
            
            with httpx.Client(verify=False, timeout=10.0) as client:
                response = client.get(url)
            
            end_time = datetime.utcnow()
            response_time = int((end_time - start_time).total_seconds() * 1000)
            
            if response.status_code == 200:
                if response_time > 3000:  # 3초 이상이면 warning
                    return StatusEnum.warning, f"{addon.name} slow response ({response_time}ms)", response_time
                return StatusEnum.healthy, f"{addon.name} healthy ({response_time}ms)", response_time
            else:
                return StatusEnum.warning, f"{addon.name} returned {response.status_code}", response_time
                
        except httpx.TimeoutException:
            return StatusEnum.critical, f"{addon.name} connection timeout", 10000
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} connection failed: {str(e)}", 0
