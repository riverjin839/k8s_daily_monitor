"""Hubble Relay 에서 최근 flow 를 조회.

구현 전략: 백엔드 컨테이너 내 `kubectl port-forward` 를 짧게 띄워
`hubble observe` 서브프로세스로 JSON lines 를 읽는다. 완료 후 정리.

요구사항:
- kubeconfig 로 kubectl 접근 가능
- 클러스터에 hubble-relay Service (기본 kube-system/hubble-relay:80) 존재
- 백엔드 이미지에 kubectl + hubble CLI 설치 (Dockerfile)

반환 flow 구조(한 줄당):
    {
      "time": ISO8601,
      "verdict": "FORWARDED" | "DROPPED" | "AUDIT" | "TRACED",
      "drop_reason": str | None,
      "source": {"namespace": str?, "pod_name": str?, "identity": int?, "labels": [str]},
      "destination": {...},
      "l4": {"protocol": "TCP"|"UDP"|..., "source_port": int?, "destination_port": int?},
      "l7": {...} | None,
      "traffic_direction": "INGRESS" | "EGRESS" | "UNKNOWN",
      "summary": str
    }
"""
from __future__ import annotations

import json
import os
import shlex
import signal
import socket
import subprocess
import time
from dataclasses import dataclass
from typing import Optional


HUBBLE_NS_DEFAULT = "kube-system"
HUBBLE_SVC_DEFAULT = "hubble-relay"
HUBBLE_PORT_DEFAULT = 80


@dataclass
class HubbleFilter:
    from_pod: Optional[str] = None      # "ns/name"
    to_pod: Optional[str] = None
    from_namespace: Optional[str] = None
    to_namespace: Optional[str] = None
    to_service: Optional[str] = None    # "ns/name"
    protocol: Optional[str] = None      # "tcp" | "udp" | "http" | "dns"
    verdict: Optional[str] = None       # "FORWARDED" | "DROPPED"
    since_seconds: int = 60
    limit: int = 200


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_port_ready(host: str, port: int, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def _build_filter_args(f: HubbleFilter) -> list[str]:
    args: list[str] = ["--last", str(max(1, min(f.limit, 5000)))]
    if f.since_seconds and f.since_seconds > 0:
        args += ["--since", f"{int(f.since_seconds)}s"]
    if f.from_pod:
        args += ["--from-pod", f.from_pod]
    if f.to_pod:
        args += ["--to-pod", f.to_pod]
    if f.from_namespace:
        args += ["--from-namespace", f.from_namespace]
    if f.to_namespace:
        args += ["--to-namespace", f.to_namespace]
    if f.to_service:
        args += ["--to-service", f.to_service]
    if f.protocol:
        args += ["--protocol", f.protocol.lower()]
    if f.verdict:
        args += ["--verdict", f.verdict.upper()]
    return args


def _parse_flow_line(line: str) -> Optional[dict]:
    line = line.strip()
    if not line:
        return None
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None
    flow = obj.get("flow") or obj  # hubble output 은 {"flow": {...}}
    if not flow:
        return None
    src = flow.get("source") or {}
    dst = flow.get("destination") or {}
    l4 = flow.get("l4") or {}
    l4_out: dict = {}
    if "TCP" in l4:
        l4_out = {"protocol": "TCP", "source_port": l4["TCP"].get("source_port"),
                  "destination_port": l4["TCP"].get("destination_port"),
                  "flags": l4["TCP"].get("flags")}
    elif "UDP" in l4:
        l4_out = {"protocol": "UDP", "source_port": l4["UDP"].get("source_port"),
                  "destination_port": l4["UDP"].get("destination_port")}
    elif "ICMPv4" in l4 or "ICMPv6" in l4:
        l4_out = {"protocol": "ICMP"}
    drop_reason = flow.get("drop_reason_desc") or flow.get("drop_reason")
    return {
        "time": flow.get("time"),
        "verdict": flow.get("verdict"),
        "drop_reason": drop_reason if flow.get("verdict") == "DROPPED" else None,
        "source": {
            "namespace": src.get("namespace"),
            "pod_name": src.get("pod_name"),
            "identity": src.get("identity"),
            "labels": src.get("labels", []),
            "ip": (flow.get("IP") or {}).get("source"),
        },
        "destination": {
            "namespace": dst.get("namespace"),
            "pod_name": dst.get("pod_name"),
            "identity": dst.get("identity"),
            "labels": dst.get("labels", []),
            "ip": (flow.get("IP") or {}).get("destination"),
        },
        "l4": l4_out,
        "l7": flow.get("l7"),
        "traffic_direction": flow.get("traffic_direction") or "UNKNOWN",
        "summary": flow.get("Summary") or flow.get("summary") or "",
    }


def fetch_flows(
    kubeconfig_path: str,
    filt: HubbleFilter,
    *,
    hubble_ns: str = HUBBLE_NS_DEFAULT,
    hubble_svc: str = HUBBLE_SVC_DEFAULT,
    hubble_port: int = HUBBLE_PORT_DEFAULT,
    timeout_sec: int = 15,
) -> dict:
    """port-forward 를 띄우고 hubble observe 한 번 실행 → flows 리스트 반환.

    실패 시 {flows: [], error: "..."} 형태로 반환.
    """
    if not kubeconfig_path or not os.path.exists(kubeconfig_path):
        return {"flows": [], "error": "kubeconfig 파일을 찾을 수 없습니다."}

    local_port = _free_port()
    pf_cmd = [
        "kubectl", "--kubeconfig", kubeconfig_path,
        "port-forward", "-n", hubble_ns,
        f"svc/{hubble_svc}", f"{local_port}:{hubble_port}",
    ]
    pf_proc: Optional[subprocess.Popen] = None
    try:
        pf_proc = subprocess.Popen(
            pf_cmd,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            preexec_fn=os.setsid,
        )
        if not _wait_port_ready("127.0.0.1", local_port, timeout=5.0):
            # 포트 안 열리면 실패 — 보통 relay 가 없거나 권한 이슈
            stderr = (pf_proc.stderr.read().decode("utf-8", "replace") if pf_proc.stderr else "")[:400]
            return {"flows": [], "error": f"Hubble Relay 에 접속 실패: {stderr or 'port-forward timeout'}"}

        obs_cmd = [
            "hubble", "observe",
            "--server", f"127.0.0.1:{local_port}",
            "--output", "json",
        ] + _build_filter_args(filt)

        result = subprocess.run(
            obs_cmd,
            capture_output=True, text=True,
            timeout=timeout_sec,
        )
        if result.returncode != 0:
            err = (result.stderr or "").strip()[:400]
            return {"flows": [], "error": f"hubble observe 실패: {err}"}

        flows: list[dict] = []
        for line in (result.stdout or "").splitlines():
            parsed = _parse_flow_line(line)
            if parsed:
                flows.append(parsed)
        return {"flows": flows, "error": None, "count": len(flows),
                "executed": " ".join(shlex.quote(a) for a in obs_cmd)}

    except FileNotFoundError as e:
        return {"flows": [], "error": f"필요한 바이너리가 없습니다: {e}"}
    except subprocess.TimeoutExpired:
        return {"flows": [], "error": f"hubble observe 타임아웃 ({timeout_sec}s)"}
    except Exception as e:
        return {"flows": [], "error": f"예외: {str(e)[:200]}"}
    finally:
        if pf_proc and pf_proc.poll() is None:
            try:
                os.killpg(os.getpgid(pf_proc.pid), signal.SIGTERM)
            except Exception:
                try:
                    pf_proc.terminate()
                except Exception:
                    pass
            try:
                pf_proc.wait(timeout=2)
            except Exception:
                pass
