"""
MinIO Checker - MinIO S3 스토리지 헬스 체크 (mc 클라이언트 사용)
"""
import subprocess
import json
import time
from typing import Optional

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class MinIOChecker(BaseChecker):
    """
    MinIO S3 스토리지 헬스 체크 (mc 클라이언트 사용)

    체크 항목:
    - mc admin info: 서버 정보 및 상태
    - mc admin health: 클러스터 헬스
    - 디스크 상태, 버킷 수, 오브젝트 수 등

    사전 요구사항:
    - mc 클라이언트 설치
    - mc alias 설정 (예: mc alias set myminio http://minio:9000 accesskey secretkey)
    """

    name = "minio"
    description = "MinIO S3 Object Storage"
    category = "storage"
    icon = "🪣"

    # mc alias 이름 (기본값, ClusterConfig에서 오버라이드 가능)
    default_alias = "myminio"

    async def check(self, config: ClusterConfig) -> CheckResult:
        """MinIO 헬스 체크 수행 (mc 클라이언트 사용)"""
        start = time.time()
        details = {}

        # mc alias 설정 (엔드포인트가 있는 경우)
        alias = self._get_alias(config)

        if config.minio_endpoint:
            setup_result = self._setup_mc_alias(config, alias)
            if not setup_result["success"]:
                return CheckResult(
                    status=CheckStatus.critical,
                    message=f"Failed to setup mc alias: {setup_result.get('error')}",
                    details=setup_result
                )

        # 1. mc admin info - 서버 정보
        info_result = self._run_mc_admin_info(alias)
        details["server_info"] = info_result

        # 2. mc admin health - 헬스 체크 (클러스터 모드인 경우)
        # health_result = self._run_mc_admin_health(alias)
        # details["health"] = health_result

        # 3. 전체 상태 결정
        overall_status = CheckStatus.healthy
        messages = []

        if info_result.get("error"):
            overall_status = CheckStatus.critical
            messages.append(f"Server info failed: {info_result.get('error')}")
        else:
            server_state = info_result.get("state", "unknown")
            if server_state == "online":
                messages.append("MinIO server online")

                # 디스크 상태 확인
                disks = info_result.get("disks", {})
                online_disks = disks.get("online", 0)
                total_disks = disks.get("total", 0)

                if total_disks > 0:
                    if online_disks < total_disks:
                        overall_status = CheckStatus.warning
                        messages.append(f"Disks: {online_disks}/{total_disks} online")
                    else:
                        messages.append(f"All {total_disks} disks online")

                # 사용량 정보
                usage = info_result.get("usage", {})
                if usage:
                    used = usage.get("used_human", "N/A")
                    total = usage.get("total_human", "N/A")
                    messages.append(f"Storage: {used}/{total}")

            elif server_state == "offline":
                overall_status = CheckStatus.critical
                messages.append("MinIO server offline")
            else:
                overall_status = CheckStatus.warning
                messages.append(f"MinIO state: {server_state}")

        response_time = int((time.time() - start) * 1000)

        return CheckResult(
            status=overall_status,
            message="; ".join(messages),
            response_time_ms=response_time,
            details=details
        )

    def _get_alias(self, config: ClusterConfig) -> str:
        """mc alias 이름 반환"""
        # ClusterConfig에 minio_alias가 있으면 사용, 없으면 기본값
        return getattr(config, 'minio_alias', None) or self.default_alias

    def _setup_mc_alias(self, config: ClusterConfig, alias: str) -> dict:
        """mc alias 설정"""
        try:
            cmd = [
                "mc", "alias", "set", alias,
                config.minio_endpoint,
                config.minio_access_key or "",
                config.minio_secret_key or "",
                "--api", "S3v4"
            ]

            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )

            if proc.returncode == 0:
                return {"success": True}
            else:
                return {"success": False, "error": proc.stderr}

        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Timeout"}
        except FileNotFoundError:
            return {"success": False, "error": "mc client not found. Install MinIO Client."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _run_mc_admin_info(self, alias: str) -> dict:
        """mc admin info 실행"""
        try:
            cmd = ["mc", "admin", "info", alias, "--json"]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if proc.returncode == 0:
                # JSON 파싱
                data = json.loads(proc.stdout)
                return self._parse_admin_info(data)
            else:
                # 에러 출력도 JSON일 수 있음
                try:
                    error_data = json.loads(proc.stdout or proc.stderr)
                    return {"error": error_data.get("error", {}).get("message", proc.stderr)}
                except:
                    return {"error": proc.stderr}

        except subprocess.TimeoutExpired:
            return {"error": "Timeout"}
        except FileNotFoundError:
            return {"error": "mc client not found"}
        except json.JSONDecodeError as e:
            return {"error": f"JSON parse error: {str(e)}"}
        except Exception as e:
            return {"error": str(e)}

    def _parse_admin_info(self, data: dict) -> dict:
        """mc admin info 결과 파싱"""
        result = {
            "state": "online",
            "version": data.get("info", {}).get("version", "unknown"),
            "uptime": data.get("info", {}).get("uptime", "unknown"),
        }

        # 서버 정보
        servers = data.get("info", {}).get("servers", [])
        result["servers_count"] = len(servers)

        # 디스크 정보 집계
        total_disks = 0
        online_disks = 0
        total_space = 0
        used_space = 0

        for server in servers:
            state = server.get("state", "")
            if state != "online":
                result["state"] = "degraded"

            for drive in server.get("drives", []):
                total_disks += 1
                if drive.get("state") == "ok":
                    online_disks += 1
                total_space += drive.get("totalspace", 0)
                used_space += drive.get("usedspace", 0)

        result["disks"] = {
            "total": total_disks,
            "online": online_disks
        }

        # 용량 정보
        if total_space > 0:
            result["usage"] = {
                "total_bytes": total_space,
                "used_bytes": used_space,
                "total_human": self._human_readable_size(total_space),
                "used_human": self._human_readable_size(used_space),
                "percent": round((used_space / total_space) * 100, 2)
            }

        # 버킷/오브젝트 수
        result["buckets"] = data.get("info", {}).get("buckets", {}).get("count", 0)
        result["objects"] = data.get("info", {}).get("objects", {}).get("count", 0)

        return result

    def _human_readable_size(self, size_bytes: int) -> str:
        """바이트를 사람이 읽기 쉬운 형식으로 변환"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB', 'PB']:
            if size_bytes < 1024:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.2f} EB"
