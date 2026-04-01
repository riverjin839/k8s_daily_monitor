import React, { useState, useEffect } from 'react';
import {
  Link2, Plus, Pencil, Trash2, ExternalLink, X, Check, Globe,
  LayoutList, LayoutGrid, GripVertical, Table2, ChevronLeft, ChevronRight,
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

type LayoutMode = 'vertical' | 'horizontal' | 'table';
const LAYOUT_KEY = 'cluster-links-layout';

interface TableAppearance {
  cellBg: string;
  headerBg: string;
  borderColor: string;
  textColor: string;
  fontSize: number;
}

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

// ── Link Card (card/list mode) ─────────────────────────────────────────────────
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

// ── Compact Link Cell (table mode) ────────────────────────────────────────────
function CompactLinkCell({
  link, onEdit, onDelete, appearance, rowHeight,
}: {
  link: ClusterLink;
  onEdit: () => void;
  onDelete: () => void;
  appearance: TableAppearance;
  rowHeight: number;
}) {
  return (
    <div
      className="group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
      style={{
        minHeight: rowHeight - 12,
        backgroundColor: appearance.cellBg,
        border: `1px solid ${appearance.borderColor}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="font-medium hover:text-primary transition-colors flex items-center gap-1 truncate"
          style={{ color: appearance.textColor, fontSize: `${appearance.fontSize}px` }}
        >
          {link.label}
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
        </a>
        {link.description && (
          <p className="truncate" style={{ color: appearance.textColor, opacity: 0.7, fontSize: `${Math.max(11, appearance.fontSize - 1)}px` }}>{link.description}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground" title="수정">
          <Pencil className="w-3 h-3" />
        </button>
        <button onClick={onDelete} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400" title="삭제">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────────
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

  // 'table' is the default layout for better readability
  const [layout, setLayout] = useState<LayoutMode>(() => {
    return (localStorage.getItem(LAYOUT_KEY) as LayoutMode) ?? 'table';
  });

  // Table mode pagination
  const [tablePage, setTablePage] = useState(0);
  const [clustersPerPage, setClustersPerPage] = useState(12);
  const [showAllInTable, setShowAllInTable] = useState(true);
  const [columnMinWidth, setColumnMinWidth] = useState(220);
  const [rowHeight, setRowHeight] = useState(72);
  const [tableHeight, setTableHeight] = useState(620);
  const [appearance, setAppearance] = useState<TableAppearance>({
    cellBg: '#f8fafc',
    headerBg: '#f1f5f9',
    borderColor: '#dbe2ea',
    textColor: '#0f172a',
    fontSize: 12,
  });

  // Active form target in table mode: 'common' | clusterId | null
  const [tableFormTarget, setTableFormTarget] = useState<string | null>(null);

  const toggleLayout = (mode: LayoutMode) => {
    setLayout(mode);
    localStorage.setItem(LAYOUT_KEY, mode);
    setTablePage(0);
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
    setTableFormTarget(null);
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
    setTableFormTarget(null);
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

  // ── Table / Matrix view ──────────────────────────────────────────────────────
  const renderTableView = () => {
    const totalPages = Math.max(1, Math.ceil(orderedGroups.length / clustersPerPage));
    const pagedGroups = showAllInTable
      ? orderedGroups
      : orderedGroups.slice(
        tablePage * clustersPerPage,
        (tablePage + 1) * clustersPerPage,
      );
    const maxRows = Math.max(
      commonLinks.length,
      ...pagedGroups.map((g) => g.links.length),
    );
    const colCount = 1 + pagedGroups.length;

    return (
      <div className="space-y-4">
        {/* Table controls */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">표 뷰 설정</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <label className="text-xs text-slate-600">
              열 최소 너비: {columnMinWidth}px
              <input type="range" min={170} max={420} step={10} value={columnMinWidth}
                onChange={(e) => setColumnMinWidth(Number(e.target.value))}
                className="w-full mt-1" />
            </label>
            <label className="text-xs text-slate-600">
              행 높이: {rowHeight}px
              <input type="range" min={54} max={120} step={2} value={rowHeight}
                onChange={(e) => setRowHeight(Number(e.target.value))}
                className="w-full mt-1" />
            </label>
            <label className="text-xs text-slate-600">
              표 높이(리사이즈): {tableHeight}px
              <input type="range" min={420} max={980} step={20} value={tableHeight}
                onChange={(e) => setTableHeight(Number(e.target.value))}
                className="w-full mt-1" />
            </label>
            <label className="text-xs text-slate-600">
              폰트 크기: {appearance.fontSize}px
              <input type="range" min={11} max={16} step={1} value={appearance.fontSize}
                onChange={(e) => setAppearance((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
                className="w-full mt-1" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <label className="flex items-center gap-1">셀 배경
              <input type="color" value={appearance.cellBg} onChange={(e) => setAppearance((prev) => ({ ...prev, cellBg: e.target.value }))} />
            </label>
            <label className="flex items-center gap-1">헤더 배경
              <input type="color" value={appearance.headerBg} onChange={(e) => setAppearance((prev) => ({ ...prev, headerBg: e.target.value }))} />
            </label>
            <label className="flex items-center gap-1">테두리
              <input type="color" value={appearance.borderColor} onChange={(e) => setAppearance((prev) => ({ ...prev, borderColor: e.target.value }))} />
            </label>
            <label className="flex items-center gap-1">폰트
              <input type="color" value={appearance.textColor} onChange={(e) => setAppearance((prev) => ({ ...prev, textColor: e.target.value }))} />
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showAllInTable} onChange={(e) => setShowAllInTable(e.target.checked)} />
              페이지 없이 전체 표시
            </label>
            {!showAllInTable && (
              <label className="flex items-center gap-1">
                페이지당 클러스터
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={clustersPerPage}
                  onChange={(e) => setClustersPerPage(Math.max(2, Number(e.target.value) || 2))}
                  className="w-16 px-1 py-0.5 rounded border border-slate-300 bg-white"
                />
              </label>
            )}
          </div>
        </div>

        {/* Table grid */}
        <div className="border border-slate-200 rounded-xl bg-slate-50/80 p-2 shadow-sm resize-y overflow-auto" style={{ height: tableHeight }}>
          <div
            className="overflow-auto"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${colCount}, minmax(${columnMinWidth}px, 1fr))`,
              border: `1px solid ${appearance.borderColor}`,
              borderRadius: '0.75rem',
              overflow: 'hidden',
              backgroundColor: '#ffffff',
            }}
          >
          {/* Header row */}
          <div className="px-3 py-2.5 border-b border-r flex items-center gap-1.5" style={{ backgroundColor: appearance.headerBg, borderColor: appearance.borderColor }}>
            <Globe className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold text-xs text-emerald-400">공통 링크</span>
            <span className="ml-auto text-xs text-muted-foreground font-normal">({commonLinks.length})</span>
            <button
              onClick={() => { setTableFormTarget('common'); setEditingCommonLink(null); setEditingLink(null); }}
              className="ml-1 p-0.5 rounded text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="공통 링크 추가"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {pagedGroups.map((g, idx) => (
            <div
              key={g.clusterId}
              className={`px-3 py-2.5 border-b flex items-center gap-1.5${idx < pagedGroups.length - 1 ? ' border-r' : ''}`}
              style={{ backgroundColor: appearance.headerBg, borderColor: appearance.borderColor }}
            >
              <span className="text-sm">☸</span>
              <span className="font-semibold text-xs truncate" style={{ color: appearance.textColor }}>{g.clusterName}</span>
              <span className="ml-auto text-xs text-muted-foreground font-normal">({g.links.length})</span>
              <button
                onClick={() => { setTableFormTarget(g.clusterId); setEditingLink(null); setEditingCommonLink(null); }}
                className="ml-1 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
                title="링크 추가"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Data rows */}
          {maxRows === 0 ? (
            <>
              <div className="p-4 border-r border-border text-center text-xs text-muted-foreground col-span-1">
                —
              </div>
              {pagedGroups.map((g, idx) => (
                <div key={g.clusterId} className={`p-4 text-center text-xs text-muted-foreground${idx < pagedGroups.length - 1 ? ' border-r border-border' : ''}`}>
                  —
                </div>
              ))}
            </>
          ) : (
            Array.from({ length: maxRows }, (_, rowIdx) => (
              <React.Fragment key={rowIdx}>
                {/* Common link cell */}
                <div className="p-2 border-b border-r border-border">
                  {commonLinks[rowIdx] ? (
                    editingCommonLink?.id === commonLinks[rowIdx].id ? (
                      <LinkForm
                        initial={commonLinks[rowIdx]}
                        onSave={handleEditCommon}
                        onCancel={() => setEditingCommonLink(null)}
                      />
                    ) : (
                      <CompactLinkCell
                        link={commonLinks[rowIdx]}
                        appearance={appearance}
                        rowHeight={rowHeight}
                        onEdit={() => { setEditingCommonLink(commonLinks[rowIdx]); setTableFormTarget(null); }}
                        onDelete={() => handleDeleteCommon(commonLinks[rowIdx].id)}
                      />
                    )
                  ) : null}
                </div>
                {/* Cluster link cells */}
                {pagedGroups.map((g, idx) => {
                  const link = g.links[rowIdx];
                  return (
                    <div
                      key={`${g.clusterId}-${rowIdx}`}
                      className={`p-2 border-b${idx < pagedGroups.length - 1 ? ' border-r' : ''}`}
                      style={{ borderColor: appearance.borderColor, minHeight: rowHeight }}
                    >
                      {link ? (
                        editingLink?.clusterId === g.clusterId && editingLink.link.id === link.id ? (
                          <LinkForm
                            initial={link}
                            onSave={(updated) => handleEditLink(g.clusterId, g.clusterName, updated)}
                            onCancel={() => setEditingLink(null)}
                          />
                        ) : (
                          <CompactLinkCell
                            link={link}
                            appearance={appearance}
                            rowHeight={rowHeight}
                            onEdit={() => { setEditingLink({ clusterId: g.clusterId, link }); setTableFormTarget(null); }}
                            onDelete={() => {
                              if (confirm(`"${link.label}" 링크를 삭제하시겠습니까?`)) handleDeleteLink(g.clusterId, link.id);
                            }}
                          />
                        )
                      ) : null}
                    </div>
                  );
                })}
              </React.Fragment>
            ))
          )}
          </div>
        </div>

        {/* Inline add form panel */}
        {(tableFormTarget === 'common' || (tableFormTarget && tableFormTarget !== 'common')) && (
          <div className="bg-card border border-border rounded-xl p-4">
            {tableFormTarget === 'common' ? (
              <>
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> 공통 링크 추가
                </p>
                <LinkForm onSave={handleAddCommon} onCancel={() => setTableFormTarget(null)} />
              </>
            ) : (() => {
              const g = orderedGroups.find((gr) => gr.clusterId === tableFormTarget);
              return g ? (
                <>
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                    <span>☸</span> {g.clusterName} — 링크 추가
                  </p>
                  <LinkForm
                    onSave={(link) => handleAddLink(g.clusterId, g.clusterName, link)}
                    onCancel={() => setTableFormTarget(null)}
                  />
                </>
              ) : null;
            })()}
          </div>
        )}

        {/* Pagination */}
        {!showAllInTable && totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">
              클러스터 {tablePage * clustersPerPage + 1}–{Math.min((tablePage + 1) * clustersPerPage, orderedGroups.length)} / 전체 {orderedGroups.length}개
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablePage((p) => Math.max(0, p - 1))}
                disabled={tablePage === 0}
                className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setTablePage(i)}
                  className={`w-7 h-7 text-xs rounded-md border transition-colors ${
                    tablePage === i
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={tablePage === totalPages - 1}
                className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Orphan groups (table mode: show below as compact list) */}
        {orphanGroups.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-3">삭제된 클러스터의 링크</p>
            <div className="space-y-2">
              {orphanGroups.map((g) => (
                <div key={g.clusterId} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-32 truncate">{g.clusterName}</span>
                  <div className="flex flex-wrap gap-1">
                    {g.links.map((link) => (
                      <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5">
                        {link.label} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Card/group render (vertical / horizontal modes) ─────────────────────────
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
              onClick={() => toggleLayout('table')}
              title="테이블 뷰 (공통 + 클러스터별 열)"
              className={`p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs ${
                layout === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <Table2 className="w-4 h-4" />
              <span>표</span>
            </button>
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

        {/* Table view (default) */}
        {layout === 'table' ? (
          clusters.length === 0 && orphanGroups.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-xl">
              <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                등록된 클러스터가 없습니다. Settings에서 클러스터를 먼저 등록해주세요.
              </p>
            </div>
          ) : (
            renderTableView()
          )
        ) : (
          /* Vertical / Horizontal card view */
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
        )}
      </main>
    </div>
  );
}
