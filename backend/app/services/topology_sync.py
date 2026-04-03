from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from typing import Any


@dataclass
class TopologyCandidate:
    source: str
    confidence: int
    priority: int
    hostname: str
    fields: dict[str, Any]


class TopologySourcePlugin:
    source_name = "unknown"

    def collect(self, payload: dict[str, Any] | None) -> list[TopologyCandidate]:
        raise NotImplementedError


class LldpCdpPlugin(TopologySourcePlugin):
    source_name = "lldp_cdp"

    def collect(self, payload: dict[str, Any] | None) -> list[TopologyCandidate]:
        payload = payload or {}
        confidence = int(payload.get("confidence", 95))
        priority = int(payload.get("priority", 90))
        items = payload.get("items", [])

        result: list[TopologyCandidate] = []
        for item in items:
            hostname = (item.get("hostname") or "").strip()
            if not hostname:
                continue
            result.append(
                TopologyCandidate(
                    source=self.source_name,
                    confidence=confidence,
                    priority=priority,
                    hostname=hostname,
                    fields={
                        "switch_name": item.get("switch_name"),
                        "rack_name": item.get("rack_name"),
                        "ip_address": item.get("ip_address"),
                    },
                )
            )
        return result


class CmdbPlugin(TopologySourcePlugin):
    source_name = "cmdb"

    def collect(self, payload: dict[str, Any] | None) -> list[TopologyCandidate]:
        payload = payload or {}
        confidence = int(payload.get("confidence", 80))
        priority = int(payload.get("priority", 70))
        items = payload.get("items", [])

        result: list[TopologyCandidate] = []
        for item in items:
            hostname = (item.get("hostname") or "").strip()
            if not hostname:
                continue
            result.append(
                TopologyCandidate(
                    source=self.source_name,
                    confidence=confidence,
                    priority=priority,
                    hostname=hostname,
                    fields={
                        "rack_name": item.get("rack_name"),
                        "role": item.get("role"),
                        "notes": item.get("notes"),
                        "os_info": item.get("os_info"),
                    },
                )
            )
        return result


class ManualUploadPlugin(TopologySourcePlugin):
    source_name = "manual"

    def collect(self, payload: dict[str, Any] | None) -> list[TopologyCandidate]:
        payload = payload or {}
        confidence = int(payload.get("confidence", 60))
        priority = int(payload.get("priority", 60))

        raw_json = payload.get("json_data")
        raw_csv = payload.get("csv_data")
        items: list[dict[str, Any]] = payload.get("items", [])

        if raw_json:
            decoded = json.loads(raw_json)
            if isinstance(decoded, dict):
                items = decoded.get("items", [])
            elif isinstance(decoded, list):
                items = decoded
        elif raw_csv:
            reader = csv.DictReader(io.StringIO(raw_csv))
            items = [row for row in reader]

        result: list[TopologyCandidate] = []
        for item in items:
            hostname = (item.get("hostname") or "").strip()
            if not hostname:
                continue
            result.append(
                TopologyCandidate(
                    source=self.source_name,
                    confidence=confidence,
                    priority=priority,
                    hostname=hostname,
                    fields={
                        "rack_name": item.get("rack_name"),
                        "switch_name": item.get("switch_name"),
                        "ip_address": item.get("ip_address"),
                        "notes": item.get("notes"),
                    },
                )
            )
        return result


PLUGIN_REGISTRY: dict[str, type[TopologySourcePlugin]] = {
    LldpCdpPlugin.source_name: LldpCdpPlugin,
    CmdbPlugin.source_name: CmdbPlugin,
    ManualUploadPlugin.source_name: ManualUploadPlugin,
}


def collect_topology_candidates(sources: list[dict[str, Any]]) -> list[TopologyCandidate]:
    candidates: list[TopologyCandidate] = []
    for source in sources:
        source_type = source.get("type")
        plugin_cls = PLUGIN_REGISTRY.get(source_type)
        if not plugin_cls:
            continue
        plugin = plugin_cls()
        candidates.extend(plugin.collect(source.get("payload")))
    return candidates
