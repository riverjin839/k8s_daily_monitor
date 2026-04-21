"""여러 호스트에 SSH/SCP 명령을 일괄 실행.

- 순차(sequential) 또는 병렬(parallel, 기본 동시성 10) 실행.
- 결과는 per-host dict 로 반환: {host, status, exitCode, stdout, stderr, durationMs, error}
- 인증: 비밀번호 또는 개인키(문자열) 중 하나.
- 외부 의존: paramiko.
"""
from __future__ import annotations

import asyncio
import io
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, asdict
from typing import Literal, Optional

import paramiko


@dataclass
class SSHResult:
    host: str
    status: Literal["ok", "error", "timeout", "auth_error", "connect_error"]
    exit_code: Optional[int]
    stdout: str
    stderr: str
    duration_ms: int
    error: Optional[str]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SSHTarget:
    host: str
    port: int = 22
    username: str = "root"
    # 아래 둘 중 하나만 사용
    password: Optional[str] = None
    private_key: Optional[str] = None  # 개인키 내용 (PEM)


def _build_client(tgt: SSHTarget, connect_timeout: int) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    # 사내망/알려진 호스트만 다룬다는 전제에서 known_hosts 불필요
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    kwargs: dict = {
        "hostname": tgt.host,
        "port": tgt.port,
        "username": tgt.username,
        "timeout": connect_timeout,
        "banner_timeout": connect_timeout,
        "auth_timeout": connect_timeout,
        "allow_agent": False,
        "look_for_keys": False,
    }
    if tgt.private_key:
        # 여러 key 포맷 시도
        key = None
        for key_cls in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.DSSKey):
            try:
                key = key_cls.from_private_key(io.StringIO(tgt.private_key))
                break
            except Exception:
                continue
        if key is None:
            raise ValueError("개인키 형식을 인식할 수 없습니다 (RSA/Ed25519/ECDSA/DSS 중 하나여야 함)")
        kwargs["pkey"] = key
    elif tgt.password is not None:
        kwargs["password"] = tgt.password
    else:
        raise ValueError("password 또는 private_key 중 하나는 필수입니다")

    client.connect(**kwargs)
    return client


def _exec_ssh(tgt: SSHTarget, command: str, connect_timeout: int, exec_timeout: int) -> SSHResult:
    start = time.monotonic()
    client: Optional[paramiko.SSHClient] = None
    try:
        client = _build_client(tgt, connect_timeout)
        stdin, stdout, stderr = client.exec_command(command, timeout=exec_timeout, get_pty=False)
        # 출력 읽기
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        elapsed = int((time.monotonic() - start) * 1000)
        return SSHResult(
            host=tgt.host,
            status="ok" if rc == 0 else "error",
            exit_code=rc,
            stdout=out[-8000:],        # 너무 길면 뒤쪽만
            stderr=err[-4000:],
            duration_ms=elapsed,
            error=None if rc == 0 else f"exit {rc}",
        )
    except paramiko.AuthenticationException as e:
        return SSHResult(
            host=tgt.host, status="auth_error", exit_code=None,
            stdout="", stderr="", duration_ms=int((time.monotonic() - start) * 1000),
            error=f"인증 실패: {str(e)[:120]}",
        )
    except (paramiko.SSHException, OSError, TimeoutError) as e:
        msg = str(e).lower()
        status = "timeout" if "timeout" in msg or "timed out" in msg else "connect_error"
        return SSHResult(
            host=tgt.host, status=status, exit_code=None,
            stdout="", stderr="", duration_ms=int((time.monotonic() - start) * 1000),
            error=f"연결 실패: {str(e)[:120]}",
        )
    except Exception as e:
        return SSHResult(
            host=tgt.host, status="error", exit_code=None,
            stdout="", stderr="", duration_ms=int((time.monotonic() - start) * 1000),
            error=str(e)[:200],
        )
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass


def _exec_scp_push(tgt: SSHTarget, local_content: bytes, remote_path: str,
                   connect_timeout: int) -> SSHResult:
    """in-memory content → remote_path 로 업로드 (SCP/SFTP)."""
    start = time.monotonic()
    client: Optional[paramiko.SSHClient] = None
    try:
        client = _build_client(tgt, connect_timeout)
        sftp = client.open_sftp()
        try:
            # 부모 디렉터리 자동 생성 시도
            parent = os.path.dirname(remote_path)
            if parent:
                try:
                    sftp.stat(parent)
                except IOError:
                    # mkdir -p
                    acc = ""
                    for part in parent.strip("/").split("/"):
                        acc = f"{acc}/{part}" if acc else f"/{part}"
                        try:
                            sftp.stat(acc)
                        except IOError:
                            try:
                                sftp.mkdir(acc)
                            except Exception:
                                pass
            with sftp.file(remote_path, "wb") as rf:
                rf.write(local_content)
        finally:
            sftp.close()
        elapsed = int((time.monotonic() - start) * 1000)
        return SSHResult(
            host=tgt.host, status="ok", exit_code=0,
            stdout=f"{len(local_content)} bytes → {remote_path}",
            stderr="", duration_ms=elapsed, error=None,
        )
    except paramiko.AuthenticationException as e:
        return SSHResult(
            host=tgt.host, status="auth_error", exit_code=None,
            stdout="", stderr="", duration_ms=int((time.monotonic() - start) * 1000),
            error=f"인증 실패: {str(e)[:120]}",
        )
    except Exception as e:
        return SSHResult(
            host=tgt.host, status="error", exit_code=None,
            stdout="", stderr="", duration_ms=int((time.monotonic() - start) * 1000),
            error=str(e)[:200],
        )
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass


async def run_bulk(
    targets: list[SSHTarget],
    *,
    action: Literal["ssh", "scp"],
    command: Optional[str] = None,
    scp_content: Optional[bytes] = None,
    scp_remote_path: Optional[str] = None,
    mode: Literal["sequential", "parallel"] = "parallel",
    connect_timeout: int = 8,
    exec_timeout: int = 60,
    parallelism: int = 10,
) -> list[SSHResult]:
    """여러 target 에 대해 SSH/SCP 일괄 실행."""

    def one(t: SSHTarget) -> SSHResult:
        if action == "ssh":
            return _exec_ssh(t, command or "", connect_timeout, exec_timeout)
        if action == "scp":
            return _exec_scp_push(t, scp_content or b"", scp_remote_path or "", connect_timeout)
        raise ValueError(f"unknown action: {action}")

    if mode == "sequential":
        # 순차: 하나씩
        return [await asyncio.get_event_loop().run_in_executor(None, one, t) for t in targets]

    # 병렬: ThreadPool 로 동시 실행
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=max(1, min(parallelism, len(targets) or 1))) as pool:
        tasks = [loop.run_in_executor(pool, one, t) for t in targets]
        return list(await asyncio.gather(*tasks))
