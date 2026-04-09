from collections import defaultdict, deque
from dataclasses import dataclass
from uuid import UUID


RELATION_WEIGHTS = {
    "runs": 0.9,
    "depends_on": 0.85,
    "uses_config": 0.8,
    "connected_to": 0.7,
    "hosts": 0.65,
}


@dataclass
class Edge:
    source: UUID
    target: UUID
    relation_type: str
    weight: float


@dataclass
class PathImpact:
    nodes: list[UUID]
    relations: list[str]
    score: float


def calculate_blast_radius(
    *,
    start_entity_id: UUID,
    edges: list[Edge],
    max_depth: int = 4,
) -> tuple[dict[UUID, float], list[PathImpact]]:
    adjacency: dict[UUID, list[Edge]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append(edge)

    best_scores: dict[UUID, float] = {start_entity_id: 1.0}
    paths: list[PathImpact] = []

    queue: deque[tuple[UUID, list[UUID], list[str], float, int]] = deque(
        [(start_entity_id, [start_entity_id], [], 1.0, 0)]
    )

    while queue:
        current, node_path, relation_path, current_score, depth = queue.popleft()
        if depth >= max_depth:
            continue

        for edge in adjacency.get(current, []):
            relation_weight = RELATION_WEIGHTS.get(edge.relation_type, 0.6)
            next_score = current_score * relation_weight * edge.weight

            if next_score < 0.05:
                continue

            next_path = node_path + [edge.target]
            next_relations = relation_path + [edge.relation_type]

            previous = best_scores.get(edge.target, 0.0)
            if next_score > previous:
                best_scores[edge.target] = next_score

            paths.append(
                PathImpact(
                    nodes=next_path,
                    relations=next_relations,
                    score=round(next_score, 4),
                )
            )
            queue.append((edge.target, next_path, next_relations, next_score, depth + 1))

    return best_scores, sorted(paths, key=lambda p: p.score, reverse=True)
