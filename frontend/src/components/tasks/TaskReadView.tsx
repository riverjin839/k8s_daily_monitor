import { ImagePlus, ExternalLink } from 'lucide-react';
import { Task } from '@/types';
import { loadTaskImages } from '@/lib/taskImages';
import { KANBAN_STATUS_LABEL, MODULE_CONFIG, TYPE_LABEL_CONFIG } from './taskKanbanUtils';
import { RichContent } from '@/components/editor';

interface TaskReadViewProps {
  task: Task;
}

const PRIORITY_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  high: { dot: 'bg-red-500', label: '높음', text: 'text-red-400' },
  medium: { dot: 'bg-blue-500', label: '보통', text: 'text-blue-400' },
  low: { dot: 'bg-slate-400', label: '낮음', text: 'text-slate-400' },
};

function formatDateTime(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

/**
 * 작업 상세 read 뷰 본문. `TaskDetailPage` (`/tasks/:id`) 에서 사용.
 * 헤더(배지·수정 버튼)는 호출 측이 그림.
 */
export function TaskReadView({ task }: TaskReadViewProps) {
  const images = loadTaskImages(task.id);
  const isCompleted = !!task.completedAt;
  const pStyle = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
  const moduleCfg = task.module ? MODULE_CONFIG[task.module] : null;
  const typeCfg = task.typeLabel ? TYPE_LABEL_CONFIG[task.typeLabel] : null;
  const kanbanLabel = KANBAN_STATUS_LABEL[task.kanbanStatus ?? 'todo'];

  return (
    <div className="space-y-5">
      {/* 배지 줄 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${
          isCompleted
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {kanbanLabel}
        </span>
        {moduleCfg && (
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${moduleCfg.cls}`}>
            {moduleCfg.label}
          </span>
        )}
        {typeCfg && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${typeCfg.cls}`}>
            {typeCfg.label}
          </span>
        )}
        <span className={`flex items-center gap-1.5 text-xs font-medium ${pStyle.text}`}>
          <span className={`w-2 h-2 rounded-full ${pStyle.dot}`} />
          {pStyle.label}
        </span>
        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
          {task.taskCategory}
        </span>
        {task.effortHours && (
          <span className="text-xs text-muted-foreground">{task.effortHours}h</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="담당자" value={task.assignee} />
        <Field label="대상 클러스터" value={task.clusterName} />
        <Field label="작업 예정일" value={formatDateTime(task.scheduledAt)} />
        <Field label="작업 완료일" value={formatDateTime(task.completedAt)} />
      </div>

      <div className="border-t border-border" />

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">작업 내용</p>
        <div className="bg-secondary/30 rounded-lg px-3 py-2.5">
          <RichContent content={task.taskContent} />
        </div>
      </div>

      {task.resultContent && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">작업 결과</p>
          <div className="bg-secondary/30 rounded-lg px-3 py-2.5">
            <RichContent content={task.resultContent} />
          </div>
        </div>
      )}

      {task.doneCondition && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">완료 조건</p>
          <p className="text-sm text-foreground/80 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
            ✓ {task.doneCondition}
          </p>
        </div>
      )}

      <Field label="비고" value={task.remarks} />

      {task.confluenceUrl && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Confluence 링크</p>
          <a
            href={task.confluenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline break-all"
          >
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate max-w-md">{task.confluenceUrl}</span>
          </a>
        </div>
      )}

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

      <div className="text-xs text-muted-foreground border-t border-border pt-3 flex gap-6">
        <span>등록: {task.createdAt?.slice(0, 10)}</span>
        {task.updatedAt !== task.createdAt && (
          <span>수정: {task.updatedAt?.slice(0, 10)}</span>
        )}
      </div>
    </div>
  );
}
