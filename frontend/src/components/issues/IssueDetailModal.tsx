import { useState } from 'react';
import { ImagePlus, ExternalLink, Pencil } from 'lucide-react';
import { Issue } from '@/types';
import { loadIssueImages } from '@/lib/issueImages';
import { RichContent } from '@/components/editor';
import { SidePane } from '@/components/common';
import { IssueForm } from './IssueForm';

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
  /** 수정 시작 시 외부 동작 (선택). 미지정 시 패널 내부에서 read↔edit 토글. */
  onEdit?: (issue: Issue) => void;
  /** 패널이 처음 뜰 때의 모드. 기본 'read'. */
  initialMode?: 'read' | 'edit';
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

function formatDateTime(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function IssueDetailModal({ issue, onClose, onEdit, initialMode = 'read' }: IssueDetailModalProps) {
  const [mode, setMode] = useState<'read' | 'edit'>(initialMode);
  const images = loadIssueImages(issue.id);
  const isResolved = !!issue.resolvedAt;

  // Edit 모드 — 폼만 풀폭으로 노출. 저장 시 read 모드로 복귀.
  if (mode === 'edit') {
    const editTitle = (
      <div className="flex items-center gap-2 min-w-0">
        <Pencil className="w-4 h-4 text-primary flex-shrink-0" />
        <h2 className="text-sm font-semibold truncate">이슈 수정</h2>
      </div>
    );
    return (
      <SidePane open onClose={onClose} title={editTitle} bodyClassName="px-6 py-5">
        <IssueForm
          initial={issue}
          embedded
          onCancel={() => setMode('read')}
          onSaved={() => setMode('read')}
        />
      </SidePane>
    );
  }

  const title = (
    <div className="flex items-center gap-3 min-w-0">
      <span className={`flex items-center gap-1.5 text-sm font-medium flex-shrink-0 ${isResolved ? 'text-emerald-500' : 'text-amber-500'}`}>
        <span className={`w-2 h-2 rounded-full ${isResolved ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {isResolved ? '조치완료' : '미조치'}
      </span>
      <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
        {issue.issueArea}
      </span>
    </div>
  );

  const headerActions = (
    <button
      onClick={() => {
        if (onEdit) onEdit(issue);
        else setMode('edit');
      }}
      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
      title="수정"
    >
      <Pencil className="w-3 h-3" /> 수정
    </button>
  );

  return (
    <SidePane open onClose={onClose} title={title} headerActions={headerActions} bodyClassName="px-6 py-5">
      <div className="space-y-5">
        {/* Meta row */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="담당자" value={issue.assignee} />
          <Field label="대상 클러스터" value={issue.clusterName} />
          <Field label="이슈 발생일" value={formatDateTime(issue.occurredAt)} />
          <Field label="이슈 조치일" value={formatDateTime(issue.resolvedAt)} />
        </div>

        <div className="border-t border-border" />

        {/* Content */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">이슈 내용</p>
          <div className="bg-secondary/30 rounded-lg px-3 py-2.5">
            <RichContent content={issue.issueContent} />
          </div>
        </div>

        {issue.actionContent && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">조치 내용</p>
            <div className="bg-secondary/30 rounded-lg px-3 py-2.5">
              <RichContent content={issue.actionContent} />
            </div>
          </div>
        )}

        {issue.detailContent && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">상세 내용</p>
            <div className="bg-secondary/30 rounded-lg px-3 py-2.5">
              <RichContent content={issue.detailContent} />
            </div>
          </div>
        )}

        <Field label="비고" value={issue.remarks} />

        {issue.confluenceUrl && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Confluence 링크</p>
            <a
              href={issue.confluenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline break-all"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-md">{issue.confluenceUrl}</span>
            </a>
          </div>
        )}

        {/* Images */}
        {images.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <ImagePlus className="w-3.5 h-3.5" />
              첨부 이미지 ({images.length}개)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {images.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`첨부 이미지 ${idx + 1}`}
                  className="w-full aspect-video object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(src, '_blank')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer meta */}
        <div className="text-xs text-muted-foreground border-t border-border pt-3 flex gap-6">
          <span>등록: {issue.createdAt?.slice(0, 10)}</span>
          {issue.updatedAt !== issue.createdAt && (
            <span>수정: {issue.updatedAt?.slice(0, 10)}</span>
          )}
        </div>
      </div>
    </SidePane>
  );
}
