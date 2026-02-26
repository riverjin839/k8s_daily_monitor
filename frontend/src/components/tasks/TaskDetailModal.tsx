import { X, ImagePlus } from 'lucide-react';
import { Task } from '@/types';
import { loadTaskImages } from '@/lib/taskImages';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onEdit: (task: Task) => void;
}

const PRIORITY_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  high: { dot: 'bg-red-500', label: '높음', text: 'text-red-400' },
  medium: { dot: 'bg-blue-500', label: '보통', text: 'text-blue-400' },
  low: { dot: 'bg-slate-400', label: '낮음', text: 'text-slate-400' },
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

export function TaskDetailModal({ task, onClose, onEdit }: TaskDetailModalProps) {
  const images = loadTaskImages(task.id);
  const isCompleted = !!task.completedAt;
  const pStyle = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${isCompleted ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isCompleted ? '완료' : '진행중'}
            </span>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${pStyle.text}`}>
              <span className={`w-2 h-2 rounded-full ${pStyle.dot}`} />
              {pStyle.label}
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20">
              {task.taskCategory}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(task)}
              className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              수정
            </button>
            <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="담당자" value={task.assignee} />
            <Field label="대상 클러스터" value={task.clusterName} />
            <Field label="작업 예정일" value={task.scheduledAt} />
            <Field label="작업 완료일" value={task.completedAt} />
          </div>

          <div className="border-t border-border" />

          {/* Content */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">작업 내용</p>
            <p className="text-sm whitespace-pre-wrap break-words bg-secondary/30 rounded-lg px-3 py-2.5">
              {task.taskContent}
            </p>
          </div>

          {task.resultContent && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">작업 결과</p>
              <p className="text-sm whitespace-pre-wrap break-words bg-secondary/30 rounded-lg px-3 py-2.5">
                {task.resultContent}
              </p>
            </div>
          )}

          <Field label="비고" value={task.remarks} />

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
            <span>등록: {task.createdAt?.slice(0, 10)}</span>
            {task.updatedAt !== task.createdAt && (
              <span>수정: {task.updatedAt?.slice(0, 10)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
