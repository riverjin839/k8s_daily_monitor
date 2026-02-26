import { useState, useEffect } from 'react';
import { Link2, Plus, Pencil, Trash2, ExternalLink, X, Check } from 'lucide-react';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';

interface ClusterLink {
  id: string;
  label: string;
  url: string;
  description?: string;
}

interface ClusterLinkGroup {
  clusterId: string;
  clusterName: string;
  links: ClusterLink[];
}

const STORAGE_KEY = 'k8s:cluster-links';

function loadLinkGroups(): ClusterLinkGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClusterLinkGroup[]) : [];
  } catch {
    return [];
  }
}

function saveLinkGroups(groups: ClusterLinkGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

interface LinkFormProps {
  initial?: ClusterLink;
  onSave: (link: ClusterLink) => void;
  onCancel: () => void;
}

function LinkForm({ initial, onSave, onCancel }: LinkFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    onSave({
      id: initial?.id ?? genId(),
      label: label.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
    });
  };

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="bg-secondary/50 border border-border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="링크 이름 *"
          className={inputClass}
          required
          autoFocus
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL * (https://...)"
          className={inputClass}
          required
        />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="설명 (선택 사항)"
        className={inputClass}
      />
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          취소
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-1"
        >
          <Check className="w-3.5 h-3.5" />
          저장
        </button>
      </div>
    </form>
  );
}

export function ClusterLinksPage() {
  const { clusters } = useClusterStore();
  useClusters();

  const [linkGroups, setLinkGroups] = useState<ClusterLinkGroup[]>(() => loadLinkGroups());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<{ clusterId: string; link: ClusterLink } | null>(null);

  // Sync localStorage whenever linkGroups changes
  useEffect(() => {
    saveLinkGroups(linkGroups);
  }, [linkGroups]);

  // Merge link groups with registered clusters (add groups for new clusters)
  const allGroups: ClusterLinkGroup[] = clusters.map((cluster) => {
    const existing = linkGroups.find((g) => g.clusterId === cluster.id);
    return existing ?? { clusterId: cluster.id, clusterName: cluster.name, links: [] };
  });

  // Also include orphan groups for deleted clusters
  const orphanGroups = linkGroups.filter((g) => !clusters.find((c) => c.id === g.clusterId));

  const upsertGroup = (group: ClusterLinkGroup) => {
    setLinkGroups((prev) => {
      const idx = prev.findIndex((g) => g.clusterId === group.clusterId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = group;
        return next;
      }
      return [...prev, group];
    });
  };

  const handleAddLink = (clusterId: string, clusterName: string, link: ClusterLink) => {
    const group = allGroups.find((g) => g.clusterId === clusterId) ??
      orphanGroups.find((g) => g.clusterId === clusterId) ??
      { clusterId, clusterName, links: [] };
    upsertGroup({ ...group, links: [...group.links, link] });
    setAddingTo(null);
  };

  const handleEditLink = (clusterId: string, clusterName: string, updated: ClusterLink) => {
    const group = allGroups.find((g) => g.clusterId === clusterId) ??
      orphanGroups.find((g) => g.clusterId === clusterId) ??
      { clusterId, clusterName, links: [] };
    upsertGroup({
      ...group,
      links: group.links.map((l) => (l.id === updated.id ? updated : l)),
    });
    setEditingLink(null);
  };

  const handleDeleteLink = (clusterId: string, linkId: string) => {
    setLinkGroups((prev) =>
      prev.map((g) =>
        g.clusterId === clusterId
          ? { ...g, links: g.links.filter((l) => l.id !== linkId) }
          : g,
      ),
    );
  };

  const renderGroup = (group: ClusterLinkGroup, isOrphan = false) => (
    <div key={group.clusterId} className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Cluster header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-base">☸</span>
          <span className="font-semibold text-sm">{group.clusterName}</span>
          {isOrphan && (
            <span className="text-xs text-muted-foreground">(삭제된 클러스터)</span>
          )}
          <span className="text-xs text-muted-foreground">({group.links.length}개 링크)</span>
        </div>
        {!isOrphan && (
          <button
            onClick={() => { setAddingTo(group.clusterId); setEditingLink(null); }}
            className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            링크 추가
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {/* Add link form */}
        {addingTo === group.clusterId && (
          <LinkForm
            onSave={(link) => handleAddLink(group.clusterId, group.clusterName, link)}
            onCancel={() => setAddingTo(null)}
          />
        )}

        {/* Link cards */}
        {group.links.length === 0 && addingTo !== group.clusterId && (
          <div className="text-center py-8">
            <Link2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p>
            <button
              onClick={() => { setAddingTo(group.clusterId); setEditingLink(null); }}
              className="mt-2 text-xs text-primary hover:text-primary/80"
            >
              + 첫 번째 링크 추가
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {group.links.map((link) => (
            <div key={link.id}>
              {editingLink?.clusterId === group.clusterId && editingLink.link.id === link.id ? (
                <LinkForm
                  initial={link}
                  onSave={(updated) => handleEditLink(group.clusterId, group.clusterName, updated)}
                  onCancel={() => setEditingLink(null)}
                />
              ) : (
                <div className="group flex items-start gap-3 px-4 py-3 bg-secondary/40 hover:bg-secondary/70 border border-border rounded-lg transition-colors">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Link2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1 truncate"
                      >
                        {link.label}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>
                    {link.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{link.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 font-mono truncate mt-0.5">{link.url}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => { setEditingLink({ clusterId: group.clusterId, link }); setAddingTo(null); }}
                      className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground"
                      title="수정"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`"${link.label}" 링크를 삭제하시겠습니까?`)) {
                          handleDeleteLink(group.clusterId, link.id);
                        }
                      }}
                      className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-400"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Page Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link2 className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">클러스터 주요 링크</h1>
          <span className="text-sm text-muted-foreground">
            — 운영 클러스터별 대시보드 · 모니터링 · 관리 콘솔 링크 등록
          </span>
        </div>

        {clusters.length === 0 ? (
          <div className="text-center py-20">
            <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground">
              등록된 클러스터가 없습니다. Settings에서 클러스터를 먼저 등록해주세요.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {allGroups.map((g) => renderGroup(g))}
            {orphanGroups.map((g) => renderGroup(g, true))}
          </div>
        )}
      </main>
    </div>
  );
}
