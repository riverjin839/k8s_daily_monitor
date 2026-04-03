import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2, Plus, Pencil, Trash2, ExternalLink, X, Check, Globe,
  GripVertical, Table2, LayoutList, LayoutGrid,
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
import { useTableViewStore, TS } from '@/stores/tableViewStore';
import { ViewModeBar } from '@/components/common';
import { ClusterLink, ClusterLinkGroup } from '@/types';

type LayoutMode = 'table' | 'vertical' | 'horizontal';
const LAYOUT_KEY   = 'cluster-links-layout';
const COLW_KEY     = 'cluster-links-col-widths';
const DEFAULT_COL  = 220;
const MIN_COL      = 110;

function genId() { return Math.random().toString(36).slice(2, 10); }

function saveColWidths(w: Record<string, number>) {
  try { localStorage.setItem(COLW_KEY, JSON.stringify(w)); } catch { /* noop */ }
}
function loadColWidths(): Record<string, number> {
  try { const r = localStorage.getItem(COLW_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

// ── Column resize handle ───────────────────────────────────────────────────────
function ColResizeHandle({ colId, currentWidth, onResize }: {
  colId: string;
  currentWidth: number;
  onResize: (id: string, w: number) => void;
}) {
  const start = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sw = currentWidth;
    const move = (ev: MouseEvent) => onResize(colId, Math.max(MIN_COL, sw + ev.clientX - sx));
    const up   = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [colId, currentWidth, onResize]);

  return (
    <div
      onMouseDown={start}
      className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 group"
      title="드래그하여 열 너비 조정"
    >
      <div className="w-px h-4 bg-border/30 group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
    </div>
  );
}

// ── Link form ─────────────────────────────────────────────────────────────────
interface LinkFormProps { initial?: ClusterLink; onSave: (l: ClusterLink) => void; onCancel: () => void; }
function LinkForm({ initial, onSave, onCancel }: LinkFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [url,   setUrl]   = useState(initial?.url ?? '');
  const [desc,  setDesc]  = useState(initial?.description ?? '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    onSave({ id: initial?.id ?? genId(), label: label.trim(), url: url.trim(), description: desc.trim() || undefined });
  };
  const cls = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  return (
    <form onSubmit={submit} className="bg-secondary/40 border border-border/60 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input type="text"  value={label} onChange={e => setLabel(e.target.value)} placeholder="링크 이름 *"       className={cls} required autoFocus />
        <input type="url"   value={url}   onChange={e => setUrl(e.target.value)}   placeholder="URL * (https://...)" className={cls} required />
      </div>
      <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="설명 (선택)" className={cls} />
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

// ── Link card (vertical/horizontal modes) ─────────────────────────────────────
function LinkCard({ link, onEdit, onDelete }: { link: ClusterLink; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3 bg-secondary/30 hover:bg-secondary/60 border border-border/40 rounded-lg transition-colors">
      <div className="w-7 h-7 bg-primary/10 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5">
        <Link2 className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="font-medium text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1 truncate">
          {link.label}<ExternalLink className="w-3 h-3 flex-shrink-0" />
        </a>
        {link.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{link.description}</p>}
        <p className="text-xs text-muted-foreground/50 font-mono truncate mt-0.5">{link.url}</p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}   className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ── Compact link cell (table mode) ────────────────────────────────────────────
function CompactLinkCell({ link, onEdit, onDelete, fontClass, fsClass }: {
  link: ClusterLink; onEdit: () => void; onDelete: () => void;
  fontClass: string; fsClass: string;
}) {
  return (
    <div className={`group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors ${fontClass} ${fsClass}`}>
      <div className="flex-1 min-w-0">
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="font-medium text-foreground/90 hover:text-primary transition-colors flex items-center gap-1 truncate">
          {link.label}<ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-50" />
        </a>
        {link.description && <p className="text-muted-foreground/60 truncate leading-tight mt-0.5">{link.description}</p>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}   className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"><Pencil className="w-2.5 h-2.5" /></button>
        <button onClick={onDelete} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
      </div>
    </div>
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────────
function SortableItem({ id, disabled, children }: {
  id: string; disabled?: boolean;
  children: (h: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ── View mode config ───────────────────────────────────────────────────────────
const VIEW_MODES = [
  { id: 'table',      label: '표',  icon: <Table2     className="w-3.5 h-3.5" /> },
  { id: 'vertical',   label: '종',  icon: <LayoutList className="w-3.5 h-3.5" /> },
  { id: 'horizontal', label: '횡',  icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

// ── Main page ──────────────────────────────────────────────────────────────────
export function ClusterLinksPage() {
  const { clusters } = useClusterStore();
  useClusters();
  const { data: linksData } = useClusterLinks();
  const updateClusterLinks   = useUpdateClusterLinks();
  const { style }            = useTableViewStore();

  // Layout
  const [layout, setLayout] = useState<LayoutMode>(() =>
    (localStorage.getItem(LAYOUT_KEY) as LayoutMode) ?? 'table',
  );
  const changeLayout = (mode: string) => {
    setLayout(mode as LayoutMode);
    localStorage.setItem(LAYOUT_KEY, mode);
  };

  // Column widths (table mode)
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColWidths);
  const handleColResize = useCallback((id: string, w: number) => {
    setColWidths(prev => {
      const next = { ...prev, [id]: w };
      saveColWidths(next);
      return next;
    });
  }, []);
  const colW = (id: string) => colWidths[id] ?? DEFAULT_COL;

  // Data
  const [linkGroups,       setLinkGroups]       = useState<ClusterLinkGroup[]>([]);
  const [groupOrder,       setGroupOrder]        = useState<string[]>([]);
  const [addingTo,         setAddingTo]          = useState<string | null>(null);
  const [editingLink,      setEditingLink]       = useState<{ clusterId: string; link: ClusterLink } | null>(null);
  const [commonLinks,      setCommonLinks]       = useState<ClusterLink[]>([]);
  const [addingCommon,     setAddingCommon]      = useState(false);
  const [editingCommon,    setEditingCommon]     = useState<ClusterLink | null>(null);
  const [tableFormTarget,  setTableFormTarget]   = useState<string | null>(null); // 'common' | clusterId

  useEffect(() => {
    if (!linksData) return;
    setLinkGroups(linksData.clusterGroups || []);
    setCommonLinks(linksData.commonLinks  || []);
  }, [linksData]);

  const persist = (groups: ClusterLinkGroup[], common: ClusterLink[]) =>
    updateClusterLinks.mutate({ clusterGroups: groups, commonLinks: common });

  const allGroups: ClusterLinkGroup[] = clusters.map(c => {
    const ex = linkGroups.find(g => g.clusterId === c.id);
    return ex ?? { clusterId: c.id, clusterName: c.name, links: [] };
  });
  const orphanGroups = linkGroups.filter(g => !clusters.find(c => c.id === g.clusterId));
  const orderedGroups = groupOrder.length > 0
    ? [...allGroups].sort((a, b) => {
        const ia = groupOrder.indexOf(a.clusterId);
        const ib = groupOrder.indexOf(b.clusterId);
        if (ia === -1) return 1; if (ib === -1) return -1;
        return ia - ib;
      })
    : allGroups;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oi = orderedGroups.findIndex(g => g.clusterId === active.id);
    const ni = orderedGroups.findIndex(g => g.clusterId === over.id);
    setGroupOrder(arrayMove(orderedGroups, oi, ni).map(g => g.clusterId));
  };

  const upsert = (groups: ClusterLinkGroup[], g: ClusterLinkGroup) => {
    const i = groups.findIndex(x => x.clusterId === g.clusterId);
    if (i >= 0) { const n = [...groups]; n[i] = g; return n; }
    return [...groups, g];
  };

  const handleAddLink = (cid: string, cname: string, link: ClusterLink) => {
    const g = allGroups.find(x => x.clusterId === cid) ?? orphanGroups.find(x => x.clusterId === cid) ?? { clusterId: cid, clusterName: cname, links: [] };
    const next = upsert(linkGroups, { ...g, links: [...g.links, link] });
    setLinkGroups(next); persist(next, commonLinks);
    setAddingTo(null); setTableFormTarget(null);
  };
  const handleEditLink = (cid: string, cname: string, updated: ClusterLink) => {
    const g = allGroups.find(x => x.clusterId === cid) ?? orphanGroups.find(x => x.clusterId === cid) ?? { clusterId: cid, clusterName: cname, links: [] };
    const next = upsert(linkGroups, { ...g, links: g.links.map(l => l.id === updated.id ? updated : l) });
    setLinkGroups(next); persist(next, commonLinks); setEditingLink(null);
  };
  const handleDeleteLink = (cid: string, lid: string) => {
    const next = linkGroups.map(g => g.clusterId === cid ? { ...g, links: g.links.filter(l => l.id !== lid) } : g);
    setLinkGroups(next); persist(next, commonLinks);
  };
  const handleAddCommon = (link: ClusterLink) => {
    const next = [...commonLinks, link];
    setCommonLinks(next); persist(linkGroups, next);
    setAddingCommon(false); setTableFormTarget(null);
  };
  const handleEditCommon = (updated: ClusterLink) => {
    const next = commonLinks.map(l => l.id === updated.id ? updated : l);
    setCommonLinks(next); persist(linkGroups, next); setEditingCommon(null);
  };
  const handleDeleteCommon = (lid: string) => {
    if (!confirm('이 링크를 삭제하시겠습니까?')) return;
    const next = commonLinks.filter(l => l.id !== lid);
    setCommonLinks(next); persist(linkGroups, next);
  };

  // ── Derived style helpers ──────────────────────────────────────────────────
  const fsClass   = TS.fontSize[style.fontSize];
  const padClass  = TS.cellPad[style.density];
  const rowMinH   = TS.rowMinH[style.density];
  const borderCls = TS.border[style.border];
  const hdrBg     = TS.headerBg[style.headerTheme];
  const hdrText   = TS.headerText[style.headerTheme];
  const fontClass = style.monoFont ? 'font-mono' : '';

  // ── Table view renderer ────────────────────────────────────────────────────
  const renderTableView = () => {
    const groups = orderedGroups; // show all — no pagination
    const maxRows = Math.max(commonLinks.length, ...groups.map(g => g.links.length), 0);

    // Build grid template
    const gridCols = [
      `${colW('common')}px`,
      ...groups.map(g => `${colW(g.clusterId)}px`),
    ].join(' ');

    const cellBase = `border ${borderCls} ${padClass}`;
    const altRowBg = (i: number) => style.altRow && i % 2 === 1 ? 'bg-white/[0.02]' : '';

    const cells: React.ReactNode[] = [];

    // ── Header row ──
    // Common header
    cells.push(
      <div key="h-common" className={`relative flex items-center gap-1.5 border-b border-r ${borderCls} px-3 py-2 bg-emerald-500/[0.08] sticky top-0 z-10`}>
        <Globe className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <span className="font-semibold text-xs text-emerald-400 truncate">공통 링크</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60 flex-shrink-0">({commonLinks.length})</span>
        <button onClick={() => { setTableFormTarget('common'); setEditingCommon(null); setEditingLink(null); }}
          className="ml-1 p-0.5 rounded text-emerald-400/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors flex-shrink-0" title="공통 링크 추가">
          <Plus className="w-3 h-3" />
        </button>
        <ColResizeHandle colId="common" currentWidth={colW('common')} onResize={handleColResize} />
      </div>,
    );
    groups.forEach((g, idx) => {
      cells.push(
        <div key={`h-${g.clusterId}`}
          className={`relative flex items-center gap-1.5 border-b ${borderCls} px-3 py-2 ${hdrBg} sticky top-0 z-10${idx < groups.length - 1 ? ` border-r ${borderCls}` : ''}`}>
          <span className="text-sm leading-none">☸</span>
          <span className={`font-semibold text-xs truncate ${hdrText}`}>{g.clusterName}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex-shrink-0">({g.links.length})</span>
          <button onClick={() => { setTableFormTarget(g.clusterId); setEditingLink(null); setEditingCommon(null); }}
            className={`ml-1 p-0.5 rounded transition-colors flex-shrink-0 ${hdrText} opacity-50 hover:opacity-100 hover:bg-white/10`} title="링크 추가">
            <Plus className="w-3 h-3" />
          </button>
          <ColResizeHandle colId={g.clusterId} currentWidth={colW(g.clusterId)} onResize={handleColResize} />
        </div>,
      );
    });

    // ── Data rows ──
    if (maxRows === 0) {
      cells.push(
        <div key="empty-common" className={`${cellBase} text-center`} style={{ minHeight: rowMinH }}>
          <span className="text-xs text-muted-foreground/40">—</span>
        </div>,
      );
      groups.forEach((g, idx) => cells.push(
        <div key={`empty-${g.clusterId}`}
          className={`${cellBase} text-center${idx < groups.length - 1 ? ` border-r ${borderCls}` : ''}`}
          style={{ minHeight: rowMinH }}>
          <span className="text-xs text-muted-foreground/40">—</span>
        </div>,
      ));
    } else {
      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const isLast = rowIdx === maxRows - 1;
        const rowAlt = altRowBg(rowIdx);

        // common cell
        cells.push(
          <div key={`c-${rowIdx}`}
            className={`border-r ${borderCls}${isLast ? '' : ` border-b ${borderCls}`} ${padClass} ${rowAlt}`}
            style={{ minHeight: rowMinH }}>
            {commonLinks[rowIdx] ? (
              editingCommon?.id === commonLinks[rowIdx].id ? (
                <LinkForm initial={commonLinks[rowIdx]} onSave={handleEditCommon} onCancel={() => setEditingCommon(null)} />
              ) : (
                <CompactLinkCell link={commonLinks[rowIdx]} fontClass={fontClass} fsClass={fsClass}
                  onEdit={() => { setEditingCommon(commonLinks[rowIdx]); setTableFormTarget(null); }}
                  onDelete={() => handleDeleteCommon(commonLinks[rowIdx].id)} />
              )
            ) : null}
          </div>,
        );

        // cluster cells
        groups.forEach((g, idx) => {
          const link = g.links[rowIdx];
          cells.push(
            <div key={`${g.clusterId}-${rowIdx}`}
              className={`${isLast ? '' : `border-b ${borderCls}`}${idx < groups.length - 1 ? ` border-r ${borderCls}` : ''} ${padClass} ${rowAlt}`}
              style={{ minHeight: rowMinH }}>
              {link ? (
                editingLink?.clusterId === g.clusterId && editingLink.link.id === link.id ? (
                  <LinkForm initial={link}
                    onSave={updated => handleEditLink(g.clusterId, g.clusterName, updated)}
                    onCancel={() => setEditingLink(null)} />
                ) : (
                  <CompactLinkCell link={link} fontClass={fontClass} fsClass={fsClass}
                    onEdit={() => { setEditingLink({ clusterId: g.clusterId, link }); setTableFormTarget(null); }}
                    onDelete={() => { if (confirm(`"${link.label}" 링크를 삭제하시겠습니까?`)) handleDeleteLink(g.clusterId, link.id); }} />
                )
              ) : null}
            </div>,
          );
        });
      }
    }

    return (
      <div className="space-y-3">
        {/* Scrollable table */}
        <div className="border border-border/40 rounded-xl overflow-auto bg-card">
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, minWidth: 'max-content' }}>
            {cells}
          </div>
        </div>

        {/* Add-link form panel */}
        {tableFormTarget && (
          <div className="bg-card border border-border/40 rounded-xl p-4">
            {tableFormTarget === 'common' ? (
              <>
                <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> 공통 링크 추가
                </p>
                <LinkForm onSave={handleAddCommon} onCancel={() => setTableFormTarget(null)} />
              </>
            ) : (() => {
              const g = orderedGroups.find(x => x.clusterId === tableFormTarget);
              return g ? (
                <>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <span>☸</span> {g.clusterName} — 링크 추가
                  </p>
                  <LinkForm
                    onSave={link => handleAddLink(g.clusterId, g.clusterName, link)}
                    onCancel={() => setTableFormTarget(null)} />
                </>
              ) : null;
            })()}
          </div>
        )}

        {/* Orphan groups */}
        {orphanGroups.length > 0 && (
          <div className="bg-card border border-border/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground/50 mb-2">삭제된 클러스터의 링크</p>
            <div className="space-y-1.5">
              {orphanGroups.map(g => (
                <div key={g.clusterId} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground/50 w-28 truncate">{g.clusterName}</span>
                  <div className="flex flex-wrap gap-2">
                    {g.links.map(l => (
                      <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-0.5 transition-colors">
                        {l.label}<ExternalLink className="w-2.5 h-2.5" />
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

  // ── Cluster group card (vertical/horizontal modes) ─────────────────────────
  const renderGroupCard = (g: ClusterLinkGroup, isOrphan: boolean, dragHandle: React.HTMLAttributes<HTMLElement>) => (
    <div className="bg-card border border-border/40 rounded-xl overflow-hidden h-full">
      <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between bg-white/[0.03]">
        <div className="flex items-center gap-2">
          {!isOrphan && (
            <span {...dragHandle} className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary transition-colors">
              <GripVertical className="w-4 h-4" />
            </span>
          )}
          <span className="text-base">☸</span>
          <span className="font-semibold text-sm">{g.clusterName}</span>
          {isOrphan && <span className="text-xs text-muted-foreground">(삭제된 클러스터)</span>}
          <span className="text-xs text-muted-foreground">({g.links.length}개)</span>
        </div>
        {!isOrphan && (
          <button onClick={() => { setAddingTo(g.clusterId); setEditingLink(null); }}
            className="px-3 py-1.5 text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-colors flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 링크 추가
          </button>
        )}
      </div>
      <div className="p-4 space-y-2">
        {addingTo === g.clusterId && (
          <LinkForm onSave={link => handleAddLink(g.clusterId, g.clusterName, link)} onCancel={() => setAddingTo(null)} />
        )}
        {g.links.length === 0 && addingTo !== g.clusterId && (
          <div className="text-center py-8">
            <Link2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">등록된 링크가 없습니다.</p>
            {!isOrphan && (
              <button onClick={() => { setAddingTo(g.clusterId); setEditingLink(null); }} className="mt-2 text-xs text-primary hover:text-primary/80">
                + 첫 번째 링크 추가
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {g.links.map(link => (
            <div key={link.id}>
              {editingLink?.clusterId === g.clusterId && editingLink.link.id === link.id ? (
                <LinkForm initial={link}
                  onSave={updated => handleEditLink(g.clusterId, g.clusterName, updated)}
                  onCancel={() => setEditingLink(null)} />
              ) : (
                <LinkCard link={link}
                  onEdit={() => { setEditingLink({ clusterId: g.clusterId, link }); setAddingTo(null); }}
                  onDelete={() => { if (confirm(`"${link.label}" 링크를 삭제하시겠습니까?`)) handleDeleteLink(g.clusterId, link.id); }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">클러스터 주요 링크</h1>
            <span className="hidden md:inline text-sm text-muted-foreground/60">
              — 운영 클러스터별 대시보드 · 모니터링 · 관리 콘솔 링크 등록
            </span>
          </div>
          <ViewModeBar modes={VIEW_MODES} active={layout} onChange={changeLayout} />
        </div>

        {/* ── Table view ── */}
        {layout === 'table' ? (
          clusters.length === 0 && orphanGroups.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border/30 rounded-xl">
              <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
              <p className="text-muted-foreground">등록된 클러스터가 없습니다. Settings에서 클러스터를 먼저 등록해주세요.</p>
            </div>
          ) : renderTableView()
        ) : (
          /* ── Card views (vertical / horizontal) ── */
          <div className="space-y-6">
            {/* Common links section */}
            <div className="bg-card border border-emerald-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-emerald-500/15 flex items-center justify-between bg-emerald-500/[0.06]">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-sm text-emerald-400">공통 서비스 링크</span>
                  <span className="text-xs text-muted-foreground">({commonLinks.length})</span>
                </div>
                <button onClick={() => { setAddingCommon(true); setEditingCommon(null); }}
                  className="px-3 py-1.5 text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-colors flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> 링크 추가
                </button>
              </div>
              <div className="p-4 space-y-2">
                {addingCommon && <LinkForm onSave={handleAddCommon} onCancel={() => setAddingCommon(false)} />}
                {commonLinks.length === 0 && !addingCommon && (
                  <div className="text-center py-8">
                    <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">등록된 공통 링크가 없습니다.</p>
                    <button onClick={() => setAddingCommon(true)} className="mt-2 text-xs text-emerald-400 hover:text-emerald-300">
                      + 첫 번째 공통 링크 추가
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {commonLinks.map(link => (
                    <div key={link.id}>
                      {editingCommon?.id === link.id ? (
                        <LinkForm initial={link} onSave={handleEditCommon} onCancel={() => setEditingCommon(null)} />
                      ) : (
                        <LinkCard link={link}
                          onEdit={() => { setEditingCommon(link); setAddingCommon(false); }}
                          onDelete={() => handleDeleteCommon(link.id)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cluster groups */}
            {clusters.length === 0 && orphanGroups.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border/30 rounded-xl">
                <Link2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
                <p className="text-muted-foreground">등록된 클러스터가 없습니다. Settings에서 클러스터를 먼저 등록해주세요.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={orderedGroups.map(g => g.clusterId)}
                  strategy={layout === 'vertical' ? verticalListSortingStrategy : horizontalListSortingStrategy}
                >
                  <div className={layout === 'horizontal' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'flex flex-col gap-6'}>
                    {orderedGroups.map(g => (
                      <SortableItem key={g.clusterId} id={g.clusterId}>
                        {h => renderGroupCard(g, false, h)}
                      </SortableItem>
                    ))}
                    {orphanGroups.map(g => (
                      <SortableItem key={g.clusterId} id={g.clusterId} disabled>
                        {h => renderGroupCard(g, true, h)}
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
