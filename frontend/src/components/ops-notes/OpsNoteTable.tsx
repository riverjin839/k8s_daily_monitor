import { Pencil, Trash2, Pin, PinOff, ExternalLink, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { OpsNote } from '@/types';
import { formatRelativeTime, stripHtml } from '@/lib/utils';

export type OpsNoteSortKey = 'title' | 'service' | 'author' | 'updatedAt';

export interface OpsNoteServiceMeta {
  value: string;
  label: string;
  icon: string;
  accent: string;
  soft: string;
}

interface OpsNoteTableProps {
  notes: OpsNote[];
  services: OpsNoteServiceMeta[];
  sortKey: OpsNoteSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: OpsNoteSortKey) => void;
  onOpen: (n: OpsNote) => void;
  onEdit: (n: OpsNote) => void;
  onDelete: (n: OpsNote) => void;
  onTogglePin: (n: OpsNote) => void;
  deletingId: string | null;
}

function SortTh({
  label, col, sortKey, sortDir, onSort, className,
}: {
  label: string;
  col: OpsNoteSortKey;
  sortKey: OpsNoteSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: OpsNoteSortKey) => void;
  className?: string;
}) {
  const isActive = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none group hover:text-foreground transition-colors ${className ?? ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sortDir === 'asc'
            ? <ChevronUp   className="w-3 h-3 text-primary" />
            : <ChevronDown className="w-3 h-3 text-primary" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </span>
    </th>
  );
}

export function OpsNoteTable({
  notes, services, sortKey, sortDir, onSort,
  onOpen, onEdit, onDelete, onTogglePin, deletingId,
}: OpsNoteTableProps) {
  const serviceMap = Object.fromEntries(services.map((s) => [s.value, s]));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-3 text-center font-medium text-muted-foreground w-10" title="고정">
                <Pin className="w-3 h-3 inline" />
              </th>
              <SortTh label="서비스" col="service" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-36" />
              <SortTh label="질문"    col="title"   sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">답변 미리보기</th>
              <SortTh label="작성자" col="author"    sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28" />
              <SortTh label="업데이트" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="w-28" />
              <th className="px-4 py-3 text-center font-medium text-muted-foreground w-32">작업</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => {
              const svc = serviceMap[note.service];
              const answerText = stripHtml(note.content);
              const hasBack = !!note.backContent?.trim();
              return (
                <tr
                  key={note.id}
                  className={`border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer ${
                    deletingId === note.id ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  onClick={() => onOpen(note)}
                >
                  <td className="px-3 py-3 text-center">
                    {note.pinned ? (
                      <Pin className="w-3.5 h-3.5 inline text-primary" />
                    ) : (
                      <span className="text-muted-foreground/30">·</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {svc ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md text-white ${svc.accent}`}>
                        <span>{svc.icon}</span>{svc.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{note.service}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="font-semibold text-foreground truncate" title={note.title}>{note.title}</p>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {answerText
                        ? answerText
                        : <span className="italic opacity-60">답변 없음</span>}
                    </p>
                    {hasBack && (
                      <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0 rounded bg-slate-500/10 text-slate-500">
                        히스토리 있음
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground truncate">
                    {note.author || <span className="text-muted-foreground/60">-</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                    {formatRelativeTime(note.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="flex items-center justify-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {note.confluenceUrl && (
                        <a
                          href={note.confluenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-primary/10 rounded-md text-muted-foreground hover:text-primary transition-colors"
                          title={`Confluence: ${note.confluenceUrl}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => onTogglePin(note)}
                        className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors"
                        title={note.pinned ? '고정 해제' : '상단 고정'}
                      >
                        {note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => onEdit(note)}
                        className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(note)}
                        className="p-1.5 hover:bg-red-500/10 rounded-md text-muted-foreground hover:text-red-400 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
