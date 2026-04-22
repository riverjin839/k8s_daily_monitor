"""원격 호스트에서 tcpdump 를 실행해 패킷을 캡처.

- 기존 ssh_runner 의 SSHTarget / _build_client / _exec_ssh 를 재사용한다.
- 대상 호스트에 접속 → `sudo tcpdump` 를 BPF 필터 + 시간/개수 제한으로 실행.
- 출력은 tcpdump 기본 텍스트 포맷(`-n -tttt`). 파이썬에서 라인별 파싱.
- 원격에 pcap 파일을 쓰지 않고 stdout 으로만 받는다 (권한/정리 간소화).
"""
from __future__ import annotations

import re
import shlex
import time
from dataclasses import dataclass, field
from typing import Optional

from app.services.ssh_runner import SSHTarget, _exec_ssh  # noqa: PLC2701 내부 재사용


# ── BPF 프리셋 ─────────────────────────────────────────────────────────────────

BPF_PRESETS: dict[str, str] = {
    "all": "",
    "https": "tcp port 443",
    "http": "tcp port 80",
    "dns": "udp port 53",
    "ssh": "tcp port 22",
    "icmp": "icmp or icmp6",
    "vlan": "vlan",
    "arp": "arp",
}


# ── 결과 타입 ─────────────────────────────────────────────────────────────────

@dataclass
class PacketRow:
    """파싱된 한 줄의 패킷 요약."""
    timestamp: str                  # "2026-04-22 12:34:56.789012"
    src: Optional[str]
    dst: Optional[str]
    proto: Optional[str]            # tcp / udp / icmp / arp 등 (상위 레이어 추정)
    flags: Optional[str]            # "[S]", "[S.]", "[P.]" 등
    length: Optional[int]
    summary: str                    # 원문 요약 (타임스탬프 이후 전부)

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "src": self.src,
            "dst": self.dst,
            "proto": self.proto,
            "flags": self.flags,
            "length": self.length,
            "summary": self.summary,
        }


@dataclass
class CaptureResult:
    host: str
    status: str                     # "ok" | "error" | "timeout" | "auth_error" | "connect_error"
    executed: str                   # 실제 원격에서 실행된 커맨드 (인증정보 제외)
    exit_code: Optional[int]
    duration_ms: int
    packets: list[PacketRow] = field(default_factory=list)
    stderr: str = ""
    raw: str = ""                   # tcpdump 원본 stdout (라인별 파싱 전)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "host": self.host,
            "status": self.status,
            "executed": self.executed,
            "exitCode": self.exit_code,
            "durationMs": self.duration_ms,
            "packets": [p.to_dict() for p in self.packets],
            "stderr": self.stderr,
            "raw": self.raw,
            "error": self.error,
        }


# ── tcpdump 라인 파서 ─────────────────────────────────────────────────────────

# `-n -tttt` 포맷:
#   2026-04-22 12:34:56.789012 IP 10.0.0.1.52344 > 10.0.0.2.443: Flags [S], seq 0, win 65535, length 0
#   2026-04-22 12:34:56.800000 ARP, Request who-has 10.0.0.2 tell 10.0.0.1, length 28
_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d+)\s+(?P<rest>.*)$"
)
_IP_RE = re.compile(
    r"(?:IP6?\s+)?(?P<src>[0-9a-fA-F:\.\-]+(?:\.\d+)?)\s+>\s+(?P<dst>[0-9a-fA-F:\.\-]+(?:\.\d+)?):\s+(?P<tail>.*)$"
)
_FLAGS_RE = re.compile(r"Flags\s+(\[[^\]]+\])")
_LEN_RE = re.compile(r"length\s+(\d+)")


def parse_tcpdump_text(text: str) -> list[PacketRow]:
    rows: list[PacketRow] = []
    for line in text.splitlines():
        line = line.rstrip()
        if not line:
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        ts = m.group("ts")
        rest = m.group("rest")

        src = dst = None
        proto: Optional[str] = None
        flags: Optional[str] = None

        ipm = _IP_RE.search(rest)
        if ipm:
            src, dst = ipm.group("src"), ipm.group("dst")
            tail = ipm.group("tail")
            # proto 추정
            head_upper = tail.upper()
            if head_upper.startswith("FLAGS"):
                proto = "tcp"
                fm = _FLAGS_RE.search(tail)
                if fm:
                    flags = fm.group(1)
            elif "UDP" in head_upper[:16]:
                proto = "udp"
            elif "ICMP" in head_upper[:16]:
                proto = "icmp"
            else:
                proto = None
        else:
            # ARP / 기타
            rest_up = rest.upper()
            if rest_up.startswith("ARP"):
                proto = "arp"
            elif rest_up.startswith("IP6"):
                proto = "ipv6"

        length: Optional[int] = None
        lm = _LEN_RE.search(rest)
        if lm:
            try:
                length = int(lm.group(1))
            except ValueError:
                length = None

        rows.append(PacketRow(
            timestamp=ts, src=src, dst=dst, proto=proto,
            flags=flags, length=length, summary=rest[:500],
        ))
    return rows


# ── 커맨드 빌더 ────────────────────────────────────────────────────────────────

def build_tcpdump_command(
    *,
    interface: str,
    bpf_filter: str = "",
    duration_sec: int = 10,
    packet_count: int = 200,
    use_sudo: bool = True,
) -> str:
    """원격에서 실행할 tcpdump 커맨드를 조립.

    - `-n -tttt` 안정된 timestamp + numeric.
    - `-c` 패킷 개수 limit.
    - `timeout <sec>` 로 전체 시간 상한 (tcpdump 이 `-c` 도달 전에 종료되게).
    - BPF 필터는 shlex.quote 로 안전하게 감싼다 (사용자 입력 이스케이프).
    """
    if not re.match(r"^[A-Za-z0-9_.:\-]{1,40}$", interface):
        raise ValueError(f"허용되지 않는 인터페이스 이름: {interface!r}")
    if not (1 <= duration_sec <= 120):
        raise ValueError("duration_sec 은 1~120 범위여야 합니다")
    if not (1 <= packet_count <= 5000):
        raise ValueError("packet_count 는 1~5000 범위여야 합니다")

    sudo = "sudo -n " if use_sudo else ""
    filter_part = f" {shlex.quote(bpf_filter.strip())}" if bpf_filter and bpf_filter.strip() else ""
    # timeout 이 tcpdump 를 죽일 때 exit code 124. -c 에 도달하면 정상 0.
    return (
        f"{sudo}timeout {duration_sec} "
        f"{sudo}tcpdump -i {interface} -n -tttt -c {packet_count} -l"
        f"{filter_part}"
    )


# ── 원격 인터페이스 조회 ────────────────────────────────────────────────────

_IFACE_RE = re.compile(r"^\d+:\s+([^:@]+)[:@]")


def list_remote_interfaces(target: SSHTarget, connect_timeout: int = 6) -> list[str]:
    """원격 호스트의 네트워크 인터페이스 목록 (ip link 결과 파싱)."""
    res = _exec_ssh(target, "ip -o link show", connect_timeout=connect_timeout, exec_timeout=6)
    if res.status != "ok":
        return []
    ifaces: list[str] = []
    for line in res.stdout.splitlines():
        m = _IFACE_RE.match(line)
        if m:
            name = m.group(1).strip()
            if name and name != "lo":
                ifaces.append(name)
    # lo 를 맨 앞에 추가 (디버깅용으로 가끔 필요)
    return ["lo"] + ifaces


# ── 캡처 실행 ────────────────────────────────────────────────────────────────

def capture(
    target: SSHTarget,
    *,
    interface: str,
    bpf_filter: str = "",
    duration_sec: int = 10,
    packet_count: int = 200,
    use_sudo: bool = True,
    connect_timeout: int = 8,
) -> CaptureResult:
    """원격 호스트에서 tcpdump 캡처 1회 수행 → 파싱된 결과 반환."""
    start = time.monotonic()

    try:
        cmd = build_tcpdump_command(
            interface=interface, bpf_filter=bpf_filter,
            duration_sec=duration_sec, packet_count=packet_count,
            use_sudo=use_sudo,
        )
    except ValueError as e:
        return CaptureResult(
            host=target.host, status="error", executed="",
            exit_code=None, duration_ms=0, error=str(e),
        )

    # exec_timeout 은 duration 보다 약간 여유.
    exec_timeout = min(duration_sec + 15, 150)
    ssh_res = _exec_ssh(target, cmd, connect_timeout=connect_timeout, exec_timeout=exec_timeout)
    elapsed = int((time.monotonic() - start) * 1000)

    # timeout 으로 끊긴 경우 exit 124 → ok 로 취급 (정상 시간 만료)
    rc = ssh_res.exit_code
    is_ok = ssh_res.status == "ok" or (ssh_res.status == "error" and rc == 124)

    rows: list[PacketRow] = []
    if is_ok and ssh_res.stdout:
        rows = parse_tcpdump_text(ssh_res.stdout)

    return CaptureResult(
        host=target.host,
        status="ok" if is_ok else ssh_res.status,
        executed=cmd,
        exit_code=rc,
        duration_ms=elapsed,
        packets=rows,
        stderr=ssh_res.stderr[-4000:],
        raw=ssh_res.stdout[-20000:],
        error=None if is_ok else ssh_res.error,
    )
