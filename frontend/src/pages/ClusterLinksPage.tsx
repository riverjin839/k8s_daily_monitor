import { useState, useEffect } from 'react';
import {
  Link2, Plus, Pencil, Trash2, ExternalLink, X, Check, Globe,
  LayoutList, LayoutGrid, GripVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClusters } from '@/hooks/useCluster';
import { useClusterLinks, useUpdateClusterLinks } from '@/hooks/useUiSettings';
import { useClusterStore } from '@/stores/clusterStore';
import { ClusterLink, ClusterLinkGroup } from '@/types';

type LayoutMode = 'vertical' | 'horizontal';
const LAYOUT_KEY = 'cluster-links-layout';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Link Form ──────────────────────────────────────────────────────────────────
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
          type="text" value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="링크 이름 *" className={inputClass} required autoFocus
        />
        <input
          type="url" value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="URL * (https://...)" className={inputClass} required
        />
      </div>
      <input
        type="text" value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="설명 (선택 사항)" className={inputClass}
      />
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> 취소
        </button>
        <button type="submit"
          className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> 저장
        </button>
      </div>
    </form>
  );
}

// ── Link Card ──────────────────────────────────────────────────────────────────
function LinkCard({ link, onEdit, onDelete }: { link: ClusterLink; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3 bg-secondary/40 hover:bg-secondary/70 border border-border rounded-lg transition-colors">
      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Link2 className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="font-medium text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1 truncate">
          {link.label}
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
        {link.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{link.description}</p>}
        <p className="text-xs text-muted-foreground/60 font-mono truncate mt-0.5">{link.url}</p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground" title="수정">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-400" title="삭제">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Sortable wrapper (render-prop pattern to avoid inner component hooks) ──────
function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function ClusterLinksPage() {
  const { clusters } = useClusterStore();
  useClusters();
  const { data: linksData } = useClusterLinks();
  const updateClusterLinks = useUpdateClusterLinks();

  const [linkGroups, setLinkGroups] = useState<ClusterLinkGroup[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<{ clusterId: string; link: ClusterLink } | null>(null);

  const [commonLinks, setCommonLinks] = useState<ClusterLink[]>([]);
  const [addingCommon, setAddingCommon] = useState(false);
  const [editingCommonLink, setEditingCommonLink] = useState<ClusterLink | null>(null);

  const [layout, setLayout] = useState<LayoutMode>(() => {
    return (localStorage.getItem(LAYOUT_KEY) as LayoutMode) ?? 'vertical';
  });

  const toggleLayout = (mode: LayoutMode) => {
    setLayout(mode);
    localStorage.setItem(LAYOUT_KEY, mode);
  };

  useEffect(() => {
    if (!linksData) return;
    setLinkGroups(linksData.clusterGroups || []);
    setCommonLinks(linksData.commonLinks || []);
  }, [linksData]);

  const persistLinks = (nextGroups: ClusterLinkGroup[], nextCommon: ClusterLink[]) => {
    updateClusterLinks.mutate({ clusterGroups: nextGroups, commonLinks: nextCommon });
  };

  const allGroups: ClusterLinkGroup[] = clusters.map((cluster) => {
    const existing = linkGroups.find((g) => g.clusterId === cluster.id);
    return existing ?? { clusterId: cluster.id, clusterName: cluster.name, links: [] };
  });

  const orphanGroups = linkGroups.filter((g) => !clusters.find((c) => c.id === g.clusterId));

  const orderedGroups =
    groupOrder.length > 0
      ? [...allGroups].sort((a, b) => {
          const ia = groupOrder.indexOf(a.clusterId);
          const ib = groupOrder.indexOf(b.clusterId);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        })
      : allGroups;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedGroups.findIndex((g) => g.clusterId === active.id);
    const newIdx = orderedGroups.findIndex((g) => g.clusterId === over.id);
    setGroupOrder(arrayMove(orderedGroups, oldIdx, newIdx).map((g) => g.clusterId));
  };

  const upsertGroup = (groups: ClusterLinkGroup[], group: ClusterLinkGroup) => {
    const idx = groups.findIndex((g) => g.clusterId === group.clusterId);
    if (idx >= 0) { const next = [...groups]; next[idx] = group; return next; }
    return [...groups, group];
  };

  const handleAddLink = (clusterId: string, clusterName: string, link: ClusterLink) => {
    const group =
      allGroups.find((g) => g.clusterId === clusterId) ??
      orphanGroups.find((g) => g.clusterId === clusterId) ??
      { clusterId, clusterName, links: [] };
    const nextGroups = upsertGroup(linkGroups, { ...group, links: [...group.links, link] });
    setLinkGroups(nextGroups);
    persistLinks(nextGroups, commonLinks);
    setAddingTo(null);
  };

  const handleEditLink = (clusterId: string, clusterName: string, updated: ClusterLink) => {
    const group =
      allGroups.find((g) => g.clusterId === clusterId) ??
      orphanGroups.find((g) => g.clusterId === clusterId) ??
      { clusterId, clusterName, links: [] };
    const nextGroups = upsertGroup(linkGroups, {
      ...group,
      links: group.links.map((l) => (l.id === updated.id ? updated : l)),
    });
    setLinkGroups(nextGroups);
    persistLinks(nextGroups, commonLinks);
    setEditingLink(null);
  };

  const handleDeleteLink = (clusterId: string, linkId: string) => {
    const nextGroups = linkGroups.map((g) =>
      g.clusterId === clusterId ? { ...g, links: g.links.filter((l) => l.id !== linkId) } : g,
    );
    setLinkGroups(nextGroups);
    persistLinks(nextGroups, commonLinks);
  };

  const handleAddCommon = (link: ClusterLink) => {
    const next = [...commonLinks, link];
    setCommonLinks(next);
    persistLinks(linkGroups, next);
    setAddingCommon(false);
  };

  const handleEditCommon = (updated: ClusterLink) => {
    const next = commonLinks.map((l) => (l.id === updated.id ? updated : l));
    setCommonLinks(next);
    persistLinks(linkGroups, next);
    setEditingCommonLink(null);
  };

  const handleDeleteCommon = (linkId: string) => {
    if (confirm('이 링크를 삭제하시겠습니까?')) {
      const next = commonLinks.filter((l) => l.id !== linkId);
      setCommonLinks(next);
      persistLinks(linkGroups, next);
    }
  };

  const renderGroupCard = (
    group: ClusterLinkGroup,
    isOrphan: boolean,
    dragHandleProps: React.HTMLAttributes<HTMLElement>,
  ) => (
    <div className="bg-card border border-border rounded-xl overflow-hidden h-full">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2">
          {!isOrphan && (
            <span
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary transition-colors"
              title="드래그하여 순서 변경"
            >
              <GripVertical className="w-4 h-4" />
            </span>
          )}
          <span className="text-base">☸</span>
          <span className="font-semibold text-sm">{group.clusterName}</span>
          {isOrphan && <span className="text-xs text-muted-foreground">(삭제된 클러스터)</span>}
          <span className="text-xs text-muted-foreground">({group.links.length}개 링크)</span>
        </div>
        {!isOrphan && (
          <button
            onClick={() => { setAddingTo(group.clusterId); setEditingLink(null); }}
            className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> 링크 추가
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {addingTo === group.clusterId && (
          <LinkForm
            onSave={(link) => handleAddLink(group.clusterId, group.clusterName, link)}
            onCancel={() => setAddingTo(null)}
          />
        )}
        {group.links.length === 0 && addingTo !== group.clusterId && (
          <div className="text-center py-8">
            <Link2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p>
            {!isOrphan && (
              <button
                onClick={() => { setAddingTo(group.clusterId); setEditingLink(null); }}
                className="mt-2 text-xs text-primary hover:text-primary/80"
              >
                + 첫 번째 링크 추가
              </button>
            )}
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
                <LinkCard
                  link={link}
                  onEdit={() => { setEditingLink({ clusterId: group.clusterId, link }); setAddingTo(null); }}
                  onDelete={() => {
                    if (confirm(`"${link.label}" 링크를 삭제하시겠습니까?`)) handleDeleteLink(group.clusterId, link.id);
                  }}
                />
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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link2 className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">클러스터 주요 링크</h1>
            <span className="text-sm text-muted-foreground">
              — 운영 클러스터별 대시보드 · 모니터링 · 관리 콘솔 링크 등록
            </span>
          </div>

          {/* Layout toggle */}
          <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-1">
            <button
              onClick={() => toggleLayout('vertical')}
              title="종으로 정렬 (세로)"
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs ${
                layout === 'vertical'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <LayoutList className="w-4 h-4" />
              <span>종</span>
            </button>
            <button
              onClick={() => toggleLayout('horizontal')}
              title="횡으로 정렬 (가로)"
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs ${
                layout === 'horizontal'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>횡</span>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Common Service Links */}
          <div className="bg-card border border-emerald-500/20 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-emerald-500/20 flex items-center justify-between bg-emerald-500/5">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-sm text-emerald-400">공통 서비스 링크</span>
                <span className="text-xs text-muted-foreground">({commonLinks.length}개 링크)</span>
                <span className="text-xs text-muted-foreground">— 클러스터 공통 사용 서비스</span>
              </div>
              <button
                onClick={() => { setAddingCommon(true); setEditingCommonLink(null); }}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 링크 추가
              </button>
            </div>
            <div className="p-4 space-y-2">
              {addingCommon && <LinkForm onSave={handleAddCommon} onCancel={() => setAddingCommon(false)} />}
              {commonLinks.length === 0 && !addingCommon && (
                <div className="text-center py-8">
                  <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">등록된 공통 링크가 없습니다.</p>
                  <button onClick={() => setAddingCommon(true)} className="mt-2 text-xs text-emerald-400 hover:text-emerald-300">
                    + 첫 번째 공통 링크 추가
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {commonLinks.map((link) => (
                  <div key={link.id}>
                    {editingCommonLink?.id === link.id ? (
                      <LinkForm initial={link} onSave={handleEditCommon} onCancel={() => setEditingCommonLink(null)} />
                    ) : (
                      <LinkCard
                        link={link}
                        onEdit={() => { setEditingCommonLink(link); setAddingCommon(false); }}
                        onDelete={() => handleDeleteCommon(link.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cluster-specific links */}
          {clusters.length === 0 && orphanGroups.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                등록된 클러스터가 없습니다. Settings에서 클러스터를 먼저 등록해주세요.
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={orderedGroups.map((g) => g.clusterId)}
                strategy={layout === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy}
              >
                <div className={layout === 'horizontal' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'flex flex-col gap-6'}>
                  {orderedGroups.map((g) => (
                    <SortableItem key={g.clusterId} id={g.clusterId}>
                      {(dragHandleProps) => renderGroupCard(g, false, dragHandleProps)}
                    </SortableItem>
                  ))}
                  {orphanGroups.map((g) => (
                    <SortableItem key={g.clusterId} id={g.clusterId} disabled>
                      {(dragHandleProps) => renderGroupCard(g, true, dragHandleProps)}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
    </div>
  );
}
