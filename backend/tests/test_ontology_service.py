import uuid

from app.services.ontology_service import Edge, calculate_blast_radius


def test_calculate_blast_radius_propagates_with_relation_weights():
    start = uuid.uuid4()
    component = uuid.uuid4()
    workload = uuid.uuid4()

    edges = [
        Edge(source=start, target=component, relation_type="uses_config", weight=1.0),
        Edge(source=component, target=workload, relation_type="depends_on", weight=0.9),
    ]

    scores, paths = calculate_blast_radius(start_entity_id=start, edges=edges, max_depth=4)

    assert component in scores
    assert workload in scores
    assert scores[component] > scores[workload]
    assert any(path.nodes[-1] == workload for path in paths)


def test_calculate_blast_radius_prunes_low_scores():
    start = uuid.uuid4()
    tiny = uuid.uuid4()

    edges = [Edge(source=start, target=tiny, relation_type="connected_to", weight=0.01)]
    scores, paths = calculate_blast_radius(start_entity_id=start, edges=edges, max_depth=2)

    assert tiny not in scores
    assert paths == []
