"""kubeconfig 재구체화 헬퍼.

/tmp 기반 저장소라 컨테이너 재시작 시 파일이 사라지는 이슈를 위해
cluster.kubeconfig_content (DB) 가 있으면 파일을 다시 써주는 한 곳에서
관리. 모든 곳(라우터 / 체커 / 자동업데이트)이 이 함수를 통해 경로를
얻도록 해서 "no such file or directory" 오류를 제거한다.
"""
import os
from uuid import UUID

from app.config import settings


def kubeconfig_store_path(cluster_id: UUID) -> str:
    return os.path.join(settings.kubeconfig_store_dir, f"{cluster_id}.yaml")


def save_kubeconfig_content(cluster_id: UUID, content: str) -> str:
    store_dir = settings.kubeconfig_store_dir
    os.makedirs(store_dir, exist_ok=True)
    path = kubeconfig_store_path(cluster_id)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o600)  # 소유자만 읽기/쓰기
    return path


def ensure_kubeconfig_file(cluster) -> str | None:
    """cluster.kubeconfig_content 가 있고 파일이 없으면 재생성.

    반환: 유효한 파일 경로 (없으면 None). cluster.kubeconfig_path 가
    업데이트 필요하면 caller 가 commit 해야 함.
    """
    # 1) 파일이 이미 있으면 그대로
    if cluster.kubeconfig_path and os.path.exists(cluster.kubeconfig_path):
        return cluster.kubeconfig_path

    # 2) DB 에 content 가 있으면 표준 경로로 재생성
    content = getattr(cluster, "kubeconfig_content", None)
    if content:
        try:
            return save_kubeconfig_content(cluster.id, content)
        except Exception:
            return None

    # 3) 둘 다 없음
    return None
