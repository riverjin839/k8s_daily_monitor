import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect

from app.config import settings
from app.database import engine, Base, SessionLocal
from fastapi import Depends

from app.routers import (
    agent_router,
    clusters_router,
    daily_check_router,
    health_router,
    history_router,
    issues_router,
    node_labels_router,
    node_images_router,
    openclaw_router,
    playbooks_router,
    promql_router,
    tasks_router,
    ui_settings_router,
    workflows_router,
    work_guide_router,
    ops_note_router,
    mindmap_router,
    management_server_router,
    infra_nodes_router,
    topology_trace_router,
    ontology_router,
    analyze_router,
    trends_router,
    versions_router,
    bulk_exec_router,
    etcdctl_router,
    mc_client_router,
    node_server_specs_router,
    cluster_custom_fields_router,
    backup_router,
    service_entries_router,
    batch_jobs_router,
    ansible_files_router,
    ansible_inventories_router,
    auth_router,
)
from app.auth.deps import get_current_user
from app.auth.security import hash_password
from app.models.user import User


def _run_migrations():
    """기존 테이블에 누락된 컬럼 추가 (경량 마이그레이션)"""
    inspector = inspect(engine)
    if "addons" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("addons")]
        if "details" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE addons ADD COLUMN details JSONB"))
        if "config" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE addons ADD COLUMN config JSONB"))
    if "playbooks" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("playbooks")]
        if "show_on_dashboard" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE playbooks ADD COLUMN show_on_dashboard BOOLEAN DEFAULT FALSE"))
        # 신규: DB 관리형 Playbook 파일 / Inventory FK
        if "playbook_file_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE playbooks ADD COLUMN playbook_file_id UUID "
                    "REFERENCES ansible_playbook_files(id)"
                ))
        if "inventory_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE playbooks ADD COLUMN inventory_id UUID "
                    "REFERENCES ansible_inventories(id)"
                ))
        # 기존 NOT NULL 제약 완화 — 이제 playbook_file_id 로도 충분.
        cols_meta = {c["name"]: c for c in inspector.get_columns("playbooks")}
        if cols_meta.get("playbook_path", {}).get("nullable") is False:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE playbooks ALTER COLUMN playbook_path DROP NOT NULL"))
    if "clusters" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("clusters")]
        new_cluster_cols = [
            ("region", "VARCHAR(100)"),
            ("operation_level", "VARCHAR(50)"),
            ("max_pod", "INTEGER"),
            ("cilium_config", "TEXT"),
            ("cidr", "VARCHAR(255)"),
            ("first_host", "VARCHAR(100)"),
            ("last_host", "VARCHAR(100)"),
            ("description", "TEXT"),
            ("node_count", "INTEGER"),
            ("hostname", "VARCHAR(255)"),
            ("pod_cidr", "VARCHAR(255)"),
            ("pod_first_host", "VARCHAR(100)"),
            ("pod_last_host", "VARCHAR(100)"),
            ("svc_cidr", "VARCHAR(255)"),
            ("svc_first_host", "VARCHAR(100)"),
            ("svc_last_host", "VARCHAR(100)"),
            ("bond0_ip", "VARCHAR(100)"),
            ("bond0_mac", "VARCHAR(50)"),
            ("bond1_ip", "VARCHAR(100)"),
            ("bond1_mac", "VARCHAR(50)"),
            ("bgp_enabled", "BOOLEAN DEFAULT FALSE"),
            ("as_number", "VARCHAR(20)"),
            ("kubeconfig_content", "TEXT"),
            ("k8s_version", "VARCHAR(128)"),
            ("cilium_version", "VARCHAR(128)"),
            ("node_ips", "TEXT"),
            ("custom_values", "JSONB"),
            ("seq", "INTEGER NOT NULL DEFAULT 1000"),
        ]
        for col_name, col_type in new_cluster_cols:
            if col_name not in columns:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE clusters ADD COLUMN {col_name} {col_type}"))

        # seq 백필 — 기존 레코드는 created_at 순서대로 1000, 1010, 1020, ...
        # 새 컬럼이 막 추가됐다면 모두 default(1000) 이라 정렬이 안정적이지 않다.
        if "seq" in [c["name"] for c in inspector.get_columns("clusters")]:
            with engine.begin() as conn:
                rows = conn.execute(text(
                    "SELECT id FROM clusters WHERE seq = 1000 ORDER BY created_at"
                )).fetchall()
                if len(rows) > 1:
                    for i, row in enumerate(rows):
                        conn.execute(
                            text("UPDATE clusters SET seq = :seq WHERE id = :id"),
                            {"seq": 1000 + i * 10, "id": row[0]},
                        )

        # 길이 확장 — VARCHAR(32) 에서 VARCHAR(128) 로. 일부 배포판 버전 문자열이
        # 32자를 초과해 StringDataRightTruncation 발생 이력. 이미 128 이면 no-op.
        cols_meta = inspector.get_columns("clusters")
        for col_name in ("k8s_version", "cilium_version"):
            meta = next((c for c in cols_meta if c["name"] == col_name), None)
            if meta is None:
                continue
            cur_len = getattr(meta.get("type"), "length", None)
            if cur_len is not None and cur_len < 128:
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE clusters ALTER COLUMN {col_name} TYPE VARCHAR(128)"
                    ))

        # 백필: kubeconfig_content 가 NULL 인 기존 레코드 중 파일이 남아있으면 DB 로 복사
        # (/tmp 기반 저장소라 재시작 후 파일이 사라지면 영원히 못 살리므로 한 번은 시도)
        import os as _os
        try:
            with engine.begin() as conn:
                rows = conn.execute(text(
                    "SELECT id, kubeconfig_path FROM clusters "
                    "WHERE (kubeconfig_content IS NULL OR kubeconfig_content = '') "
                    "  AND kubeconfig_path IS NOT NULL AND kubeconfig_path != ''"
                )).fetchall()
                for cid, kc_path in rows:
                    if kc_path and _os.path.exists(kc_path):
                        try:
                            with open(kc_path, encoding="utf-8") as f:
                                kc_content = f.read()
                            if kc_content.strip():
                                conn.execute(
                                    text("UPDATE clusters SET kubeconfig_content = :c WHERE id = :id"),
                                    {"c": kc_content, "id": cid},
                                )
                        except Exception:
                            pass
        except Exception:
            pass
    # trend_sources: 마지막 수집 상태 컬럼 추가
    if "trend_sources" in inspector.get_table_names():
        ts_cols = [c["name"] for c in inspector.get_columns("trend_sources")]
        for col_name, col_type in [
            ("last_status", "VARCHAR(20)"),
            ("last_message", "TEXT"),
            ("last_item_count", "INTEGER DEFAULT 0"),
            ("last_collected_at", "TIMESTAMP WITHOUT TIME ZONE"),
        ]:
            if col_name not in ts_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE trend_sources ADD COLUMN {col_name} {col_type}"))

    if "issues" in inspector.get_table_names():
        issue_cols = [col["name"] for col in inspector.get_columns("issues")]
        if "detail_content" not in issue_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE issues ADD COLUMN detail_content TEXT"))
        # 통합지식 service tag — ui_settings.serviceCatalog 의 slug 와 연결
        if "service" not in issue_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE issues ADD COLUMN service VARCHAR(64)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_issues_service ON issues (service)"))
    if "workflow_steps" in inspector.get_table_names():
        wf_step_cols = [col["name"] for col in inspector.get_columns("workflow_steps")]
        for col_name, col_type, default in [
            ("step_type", "VARCHAR(50)", "'action'"),
            ("status", "VARCHAR(20)", "'idle'"),
        ]:
            if col_name not in wf_step_cols:
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE workflow_steps ADD COLUMN {col_name} {col_type} NOT NULL DEFAULT {default}"
                    ))
        # 워크플로 노드 연계 컬럼
        for col_name, col_type in [("reference_type", "VARCHAR(50)"), ("reference_id", "VARCHAR(100)")]:
            if col_name not in wf_step_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE workflow_steps ADD COLUMN {col_name} {col_type}"))
    # tasks: Date → DateTime 마이그레이션 + 칸반 보드 필드 추가
    if "tasks" in inspector.get_table_names():
        task_col_map = {col["name"]: col["type"].__class__.__name__ for col in inspector.get_columns("tasks")}
        for col_name in ("scheduled_at", "completed_at"):
            if col_name in task_col_map and task_col_map[col_name].upper() == "DATE":
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE tasks ALTER COLUMN {col_name} TYPE TIMESTAMP WITHOUT TIME ZONE "
                        f"USING {col_name}::TIMESTAMP WITHOUT TIME ZONE"
                    ))
        # 칸반 보드 신규 컬럼
        task_cols = list(task_col_map.keys())
        kanban_status_is_new = "kanban_status" not in task_cols
        new_task_kanban_cols = [
            ("kanban_status", "VARCHAR(20) NOT NULL DEFAULT 'todo'"),
            ("module", "VARCHAR(50)"),
            ("type_label", "VARCHAR(20)"),
            ("effort_hours", "INTEGER"),
            ("done_condition", "TEXT"),
            # 통합지식 service tag — ui_settings.serviceCatalog 의 slug 와 연결
            ("service", "VARCHAR(64)"),
        ]
        for col_name, col_type in new_task_kanban_cols:
            if col_name not in task_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}"))
        # 기존 completed_at 있는 레코드 → done 으로 동기화 (최초 마이그레이션 1회만)
        if kanban_status_is_new:
            with engine.begin() as conn:
                conn.execute(text("UPDATE tasks SET kanban_status = 'done' WHERE completed_at IS NOT NULL"))
        # Task: parent_id for sub-tasks
        if "parent_id" not in task_cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE tasks ADD COLUMN parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE'))
            import logging as _logging
            _logging.getLogger(__name__).info("Migration: added tasks.parent_id")
        # Task: issue_id — 작업에 연결된 이슈 (optional)
        if "issue_id" not in task_cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE tasks ADD COLUMN issue_id UUID REFERENCES issues(id) ON DELETE SET NULL'))
    # issues: Date → DateTime 마이그레이션
    if "issues" in inspector.get_table_names():
        issue_col_map = {col["name"]: col["type"].__class__.__name__ for col in inspector.get_columns("issues")}
        for col_name in ("occurred_at", "resolved_at"):
            if col_name in issue_col_map and issue_col_map[col_name].upper() == "DATE":
                with engine.begin() as conn:
                    conn.execute(text(
                        f"ALTER TABLE issues ALTER COLUMN {col_name} TYPE TIMESTAMP WITHOUT TIME ZONE "
                        f"USING {col_name}::TIMESTAMP WITHOUT TIME ZONE"
                    ))
        if "primary_assignee" not in issue_col_map:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE issues ADD COLUMN primary_assignee VARCHAR(100)"))
                conn.execute(text("UPDATE issues SET primary_assignee = assignee WHERE primary_assignee IS NULL"))
                conn.execute(text("ALTER TABLE issues ALTER COLUMN primary_assignee SET NOT NULL"))
        if "secondary_assignee" not in issue_col_map:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE issues ADD COLUMN secondary_assignee VARCHAR(100)"))

    if "tasks" in inspector.get_table_names():
        task_cols = [col["name"] for col in inspector.get_columns("tasks")]
        if "primary_assignee" not in task_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN primary_assignee VARCHAR(100)"))
                conn.execute(text("UPDATE tasks SET primary_assignee = assignee WHERE primary_assignee IS NULL"))
                conn.execute(text("ALTER TABLE tasks ALTER COLUMN primary_assignee SET NOT NULL"))
        if "secondary_assignee" not in task_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN secondary_assignee VARCHAR(100)"))


    # clusters: statusenum 에 'pending' 값 추가 (PostgreSQL enum 확장)
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TYPE statusenum ADD VALUE IF NOT EXISTS 'pending'"))
    except Exception:
        pass  # 이미 존재하거나 enum 이름이 다를 경우 무시

    # infra_nodes: 물리 서버 노드 테이블 생성
    if "infra_nodes" not in inspector.get_table_names():
        with engine.begin() as conn:
            conn.execute(text('''
                CREATE TABLE infra_nodes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
                    hostname VARCHAR(255) NOT NULL,
                    rack_name VARCHAR(100),
                    ip_address VARCHAR(45),
                    role VARCHAR(20) NOT NULL DEFAULT \'worker\',
                    cpu_cores INTEGER,
                    ram_gb INTEGER,
                    disk_gb INTEGER,
                    os_info VARCHAR(200),
                    switch_name VARCHAR(100),
                    notes TEXT,
                    auto_synced BOOLEAN DEFAULT FALSE,
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            '''))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_infra_nodes_cluster_hostname "
                "ON infra_nodes(cluster_id, hostname)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_infra_nodes_cluster_hostname "
                "ON infra_nodes(cluster_id, hostname)"
            ))
    else:
        infra_cols = [col["name"] for col in inspector.get_columns("infra_nodes")]
        if "version" not in infra_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE infra_nodes ADD COLUMN version INTEGER NOT NULL DEFAULT 1"))
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_infra_nodes_cluster_hostname "
                "ON infra_nodes(cluster_id, hostname)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_infra_nodes_cluster_hostname "
                "ON infra_nodes(cluster_id, hostname)"
            ))

    # topology_audit_logs: 토폴로지 변경 감사 로그
    if "topology_audit_logs" not in inspector.get_table_names():
        with engine.begin() as conn:
            conn.execute(text('''
                CREATE TABLE topology_audit_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
                    entity_type VARCHAR(20) NOT NULL,
                    entity_id VARCHAR(100),
                    action VARCHAR(30) NOT NULL,
                    scope VARCHAR(20) NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'success',
                    reason TEXT,
                    before_data JSONB,
                    after_data JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            '''))

    # work_guides: 계층 구조 + 정렬 컬럼 추가
    if "work_guides" in inspector.get_table_names():
        wg_cols = [col["name"] for col in inspector.get_columns("work_guides")]
        for col_name, col_type in [
            ("parent_id", "UUID"),
            ("sort_order", "INTEGER NOT NULL DEFAULT 0"),
        ]:
            if col_name not in wg_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE work_guides ADD COLUMN {col_name} {col_type}"))

    # node_server_specs: 자산 대장 신규 필드
    if "node_server_specs" in inspector.get_table_names():
        ns_cols_info = inspector.get_columns("node_server_specs")
        ns_cols = [col["name"] for col in ns_cols_info]
        for col_name, col_type in [
            ("is_ssd", "BOOLEAN"),
            ("is_vm", "BOOLEAN"),
            ("current_usage", "VARCHAR(255)"),
            ("purchase_purpose", "VARCHAR(255)"),
            ("non_os_disk_gb", "INTEGER"),
        ]:
            if col_name not in ns_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE node_server_specs ADD COLUMN {col_name} {col_type}"))

        # disk_type: VARCHAR(32) → VARCHAR(255) 로 확장 ("NVMe (nvme0n1, ...)" 같은 자동수집 문자열 수용)
        for col in ns_cols_info:
            if col["name"] == "disk_type":
                col_len = getattr(col["type"], "length", None)
                if col_len is not None and col_len < 255:
                    with engine.begin() as conn:
                        conn.execute(text("ALTER TABLE node_server_specs ALTER COLUMN disk_type TYPE VARCHAR(255)"))
                break


def _seed_default_metric_cards():
    """Seed default PromQL metric cards if the table is empty."""
    from app.models.metric_card import MetricCard

    db = SessionLocal()
    try:
        if db.query(MetricCard).count() > 0:
            return  # already seeded

        defaults = [
            MetricCard(
                title="CrashLoopBackOff Pods",
                description="Number of pods stuck in CrashLoopBackOff",
                icon="🚨",
                promql='sum(kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"}) OR on() vector(0)',
                unit="count",
                display_type="value",
                category="alert",
                thresholds="warning:1,critical:3",
                sort_order=0,
            ),
            MetricCard(
                title="Failed Pods",
                description="Number of pods in Failed phase",
                icon="💀",
                promql='sum(kube_pod_status_phase{phase="Failed"}) OR on() vector(0)',
                unit="count",
                display_type="value",
                category="alert",
                thresholds="warning:1,critical:5",
                sort_order=1,
            ),
            MetricCard(
                title="Cluster CPU Usage",
                description="Overall cluster CPU utilization",
                icon="⚡",
                promql='100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
                unit="%",
                display_type="gauge",
                category="resource",
                thresholds="warning:70,critical:90",
                sort_order=2,
            ),
            MetricCard(
                title="Cluster Memory Usage",
                description="Overall cluster memory utilization",
                icon="🧠",
                promql="100 * (1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)))",
                unit="%",
                display_type="gauge",
                category="resource",
                thresholds="warning:75,critical:90",
                sort_order=3,
            ),
            MetricCard(
                title="PVC Disk Usage > 80%",
                description="Persistent volumes nearing capacity",
                icon="💾",
                promql="(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) * 100 > 80",
                unit="%",
                display_type="list",
                category="storage",
                thresholds="warning:80,critical:95",
                sort_order=4,
            ),
            MetricCard(
                title="Inbound Network Traffic",
                description="Cluster-wide inbound traffic rate",
                icon="🌐",
                promql="sum(rate(container_network_receive_bytes_total[5m]))",
                unit="bytes/s",
                display_type="value",
                category="network",
                sort_order=5,
            ),
        ]

        db.add_all(defaults)
        db.commit()
    finally:
        db.close()


def _seed_default_trend_sources():
    """기본 트렌드 수집 소스 등록 (최초 1회)"""
    from app.models.trend import TrendSource

    db = SessionLocal()
    try:
        if db.query(TrendSource).count() > 0:
            return
        defaults = [
            TrendSource(name="Kubernetes", source_type="github_release", url="kubernetes/kubernetes", category="k8s"),
            TrendSource(name="Cilium",     source_type="github_release", url="cilium/cilium",         category="cilium"),
            TrendSource(name="Linux Kernel", source_type="github_release", url="torvalds/linux",      category="linux"),
            TrendSource(name="Kubernetes 블로그", source_type="rss", url="https://kubernetes.io/feed.xml",       category="k8s"),
            TrendSource(name="Cilium 블로그",     source_type="rss", url="https://cilium.io/blog/rss.xml",      category="cilium"),
            TrendSource(name="CNCF 블로그",       source_type="rss", url="https://www.cncf.io/blog/feed/",      category="cncf"),
            TrendSource(name="LWN.net",           source_type="rss", url="https://lwn.net/headlines/rss",       category="linux"),
            TrendSource(name="kernel.org",        source_type="rss", url="https://www.kernel.org/feeds/all.atom.xml", category="linux"),
        ]
        db.add_all(defaults)
        db.commit()
    finally:
        db.close()


_SAMPLE_PLAYBOOKS = [
    {
        "name": "NTP / Chrony 동기화 점검",
        "description": "각 노드의 시간 동기화 상태와 drift 를 점검 (chronyc tracking / timedatectl).",
        "playbook_path": "ntp_sync_check.yml",
        "extra_vars": {"max_drift_ms": 1000},
        "show_on_dashboard": True,
    },
    {
        "name": "디스크 사용률 점검",
        "description": "df -P 결과를 파싱해 임계 (warn 80%, crit 90%) 초과 파티션 검출.",
        "playbook_path": "disk_usage_check.yml",
        "extra_vars": {"warn_pct": 80, "crit_pct": 90},
        "show_on_dashboard": True,
    },
    {
        "name": "K8s 권장 sysctl 감사",
        "description": "net.bridge.bridge-nf-call-iptables, ip_forward, swappiness 등 권장값 위반 검출.",
        "playbook_path": "kernel_sysctl_audit.yml",
        "extra_vars": None,
        "show_on_dashboard": False,
    },
    {
        "name": "노드 부하 (load average) 점검",
        "description": "load5 / CPU코어 비율로 부하 경고 (warn 0.8, crit 1.5).",
        "playbook_path": "node_load_check.yml",
        "extra_vars": {"warn_ratio": 0.8, "crit_ratio": 1.5},
        "show_on_dashboard": True,
    },
    {
        "name": "K8s 인증서 만료 점검",
        "description": "/etc/kubernetes/pki/*.crt 들의 NotAfter 까지 남은 일수 (warn 60일 · crit 14일).",
        "playbook_path": "cert_expiry_check.yml",
        "extra_vars": {"warn_days": 60, "crit_days": 14},
        "show_on_dashboard": True,
    },
]


def _seed_default_playbooks():
    """샘플 playbook 시드.

    구조: ``ansible/playbooks/*.yml`` 본문을 DB(``ansible_playbook_files``) 에 적재한 뒤,
    각 클러스터에 대해 ``Playbook`` 행을 생성하고 ``playbook_file_id`` 로 연결한다.
    이렇게 하면 사용자가 운영 중 카드 본문을 수정·재배포할 때도 컨테이너 이미지를
    다시 만들 필요 없이 DB 만으로 관리된다.

    이미 같은 name 으로 등록된 playbook 이 있으면 skip — 사용자 변경을 보존.
    """
    from app.models.ansible_assets import AnsiblePlaybookFile
    from app.models.cluster import Cluster
    from app.models.playbook import Playbook

    # 1) 디스크의 .yml 본문을 읽어 ansible_playbook_files 에 upsert.
    base_dir = settings.ansible_playbook_dir.rstrip("/")
    file_id_by_sample: dict[str, "uuid.UUID"] = {}
    db = SessionLocal()
    try:
        for sp in _SAMPLE_PLAYBOOKS:
            disk_path = f"{base_dir}/{sp['playbook_path']}"
            if not os.path.exists(disk_path):
                # 파일이 없으면 스킵 — 컨테이너 빌드 컨텍스트에 ansible/ 가 빠진 경우.
                continue
            try:
                with open(disk_path, "r", encoding="utf-8") as f:
                    body = f.read()
            except OSError:
                continue

            existing = db.query(AnsiblePlaybookFile).filter(
                AnsiblePlaybookFile.name == sp["name"],
            ).first()
            if existing is None:
                row = AnsiblePlaybookFile(
                    name=sp["name"],
                    description=sp["description"],
                    content=body,
                )
                db.add(row)
                db.flush()
                file_id_by_sample[sp["name"]] = row.id
            else:
                # 기존 description 만 갱신 (content 는 사용자 편집 가능성 있어 보존).
                if existing.description != sp["description"]:
                    existing.description = sp["description"]
                file_id_by_sample[sp["name"]] = existing.id
        db.commit()

        # 2) 등록된 클러스터마다 Playbook 행을 생성, playbook_file_id 로 연결.
        clusters = db.query(Cluster).all()
        if not clusters:
            return  # 클러스터가 등록될 때까지 보류 (재기동 시 다시 시도됨)

        added = 0
        for cluster in clusters:
            existing_names = {
                row[0] for row in db.query(Playbook.name)
                .filter(Playbook.cluster_id == cluster.id).all()
            }
            for sp in _SAMPLE_PLAYBOOKS:
                if sp["name"] in existing_names:
                    continue
                pb = Playbook(
                    cluster_id=cluster.id,
                    name=sp["name"],
                    description=sp["description"],
                    # 신 모델: DB 본문을 가리키는 FK 사용. (구 playbook_path 는 더 이상 의존하지 않음)
                    playbook_file_id=file_id_by_sample.get(sp["name"]),
                    inventory_path=None,   # ← K8s 전체 노드를 동적 inventory 로 사용
                    extra_vars=sp.get("extra_vars"),
                    show_on_dashboard=sp.get("show_on_dashboard", False),
                )
                db.add(pb)
                added += 1
        if added:
            db.commit()
    finally:
        db.close()


def _seed_initial_admin():
    """Create the bootstrap admin if no users exist yet. Idempotent."""
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        admin = User(
            username=settings.initial_admin_username,
            hashed_password=hash_password(settings.initial_admin_password),
            role="admin",
            display_name="Administrator",
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: DB 테이블 생성
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _seed_default_metric_cards()
    _seed_default_trend_sources()
    _seed_default_playbooks()
    _seed_initial_admin()
    yield
    # Shutdown: 필요한 정리 작업


# FastAPI 앱 생성
app = FastAPI(
    title=settings.app_name,
    description="DevOps K8s Daily Monitoring Dashboard API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS 설정 - Kubernetes 환경 지원
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://frontend",
    "http://frontend:80",
]

# 환경변수로 추가 origin 설정 가능
extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if extra_origins:
    allowed_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routers (no auth) — login + liveness/readiness probes.
app.include_router(auth_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api/v1")

# Protected routers — every endpoint below requires a valid JWT.
_auth = [Depends(get_current_user)]
app.include_router(clusters_router, prefix="/api/v1", dependencies=_auth)
app.include_router(history_router, prefix="/api/v1", dependencies=_auth)
app.include_router(daily_check_router, prefix="/api/v1", dependencies=_auth)
app.include_router(playbooks_router, prefix="/api/v1", dependencies=_auth)
app.include_router(agent_router, prefix="/api/v1", dependencies=_auth)
app.include_router(promql_router, prefix="/api/v1", dependencies=_auth)
app.include_router(openclaw_router, prefix="/api/v1", dependencies=_auth)
app.include_router(issues_router, prefix="/api/v1", dependencies=_auth)
app.include_router(tasks_router, prefix="/api/v1", dependencies=_auth)
app.include_router(ui_settings_router, prefix="/api/v1", dependencies=_auth)
app.include_router(node_labels_router, prefix="/api/v1", dependencies=_auth)
app.include_router(node_images_router, prefix="/api/v1", dependencies=_auth)
app.include_router(workflows_router, prefix="/api/v1", dependencies=_auth)
app.include_router(work_guide_router, prefix="/api/v1", dependencies=_auth)
app.include_router(ops_note_router, prefix="/api/v1", dependencies=_auth)
app.include_router(mindmap_router, prefix="/api/v1", dependencies=_auth)
app.include_router(management_server_router, prefix="/api/v1", dependencies=_auth)
app.include_router(infra_nodes_router, prefix="/api/v1", dependencies=_auth)
app.include_router(topology_trace_router, prefix="/api/v1", dependencies=_auth)
app.include_router(ontology_router, prefix="/api/v1", dependencies=_auth)
app.include_router(analyze_router, prefix="/api/v1", dependencies=_auth)
app.include_router(trends_router, prefix="/api/v1", dependencies=_auth)
app.include_router(versions_router, prefix="/api/v1", dependencies=_auth)
app.include_router(bulk_exec_router, prefix="/api/v1", dependencies=_auth)
app.include_router(etcdctl_router, prefix="/api/v1", dependencies=_auth)
app.include_router(mc_client_router, prefix="/api/v1", dependencies=_auth)
app.include_router(node_server_specs_router, prefix="/api/v1", dependencies=_auth)
app.include_router(cluster_custom_fields_router, prefix="/api/v1", dependencies=_auth)
app.include_router(backup_router, prefix="/api/v1", dependencies=_auth)
app.include_router(service_entries_router, prefix="/api/v1", dependencies=_auth)
app.include_router(batch_jobs_router, prefix="/api/v1", dependencies=_auth)
app.include_router(ansible_files_router, prefix="/api/v1", dependencies=_auth)
app.include_router(ansible_inventories_router, prefix="/api/v1", dependencies=_auth)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Kubernetes liveness/readiness probe endpoint"""
    return {"status": "healthy"}


@app.get("/health/live")
def liveness_check():
    """Kubernetes liveness probe - checks if app is running"""
    return {"status": "alive"}


@app.get("/health/ready")
def readiness_check():
    """Kubernetes readiness probe - checks if app is ready to serve traffic"""
    try:
        # Check database connection
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return {"status": "not_ready", "database": "disconnected", "error": str(e)}
