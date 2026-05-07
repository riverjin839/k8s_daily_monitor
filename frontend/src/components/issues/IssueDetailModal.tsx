import { ImagePlus, ExternalLink, Pencil } from 'lucide-react';
import { Issue } from '@/types';
import { loadIssueImages } from '@/lib/issueImages';
import { RichContent } from '@/components/editor';
import { SidePane } from '@/components/common';

interface IssueDetailModalProps {
  issue: Issue;
  onClose: () => void;
  onEdit: (issue: Issue) => void;
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

export function IssueDetailModal({ issue, onClose, onEdit }: IssueDetailModalProps) {
  const images = loadIssueImages(issue.id);
  const isResolved = !!issue.resolvedAt;

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
      onClick={() => onEdit(issue)}
      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
      title="수정"
    >
      <Pencil className="w-3 h-3" /> 수정
    </button>
  );

  return (
    <SidePane open onClose={onClose} title={title} headerActions={headerActions} bodyClassName="px-6 py-5">
      <div className="space-y-5">{/* preserve original body padding via parent */}
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
