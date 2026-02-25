import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task, TaskCreate } from '@/types';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskCreate) => void;
  clusters: { id: string; name: string }[];
  editTask?: Task | null;
}

const TASK_CATEGORIES = [
  'Cluster 점검',
  'Node 관리',
  'Pod 배포',
  'Network 설정',
  'Storage 관리',
  'RBAC / 보안',
  'Monitoring 설정',
  'Backup / Restore',
  '업그레이드',
  '장애 대응',
  '문서 작업',
  '기타',
];

const PRIORITIES = [
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TaskModal({ isOpen, onClose, onSubmit, clusters, editTask }: TaskModalProps) {
  const [assignee, setAssignee] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskCategoryCustom, setTaskCategoryCustom] = useState('');
  const [taskContent, setTaskContent] = useState('');
  const [resultContent, setResultContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState(today());
  const [completedAt, setCompletedAt] = useState('');
  const [priority, setPriority] = useState('medium');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (editTask) {
      setAssignee(editTask.assignee);
      setClusterId(editTask.clusterId ?? '');
      const predefined = TASK_CATEGORIES.includes(editTask.taskCategory);
      setTaskCategory(predefined ? editTask.taskCategory : '기타');
      setTaskCategoryCustom(predefined ? '' : editTask.taskCategory);
      setTaskContent(editTask.taskContent);
      setResultContent(editTask.resultContent ?? '');
      setScheduledAt(editTask.scheduledAt);
      setCompletedAt(editTask.completedAt ?? '');
      setPriority(editTask.priority);
      setRemarks(editTask.remarks ?? '');
    } else {
      setAssignee('');
      setClusterId('');
      setTaskCategory('');
      setTaskCategoryCustom('');
      setTaskContent('');
      setResultContent('');
      setScheduledAt(today());
      setCompletedAt('');
      setPriority('medium');
      setRemarks('');
    }
  }, [editTask, isOpen]);

  if (!isOpen) return null;

  const resolvedCategory = taskCategory === '기타' ? taskCategoryCustom.trim() : taskCategory;
  const selectedCluster = clusters.find((c) => c.id === clusterId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignee.trim() || !resolvedCategory || !taskContent.trim() || !scheduledAt) return;

    onSubmit({
      assignee: assignee.trim(),
      clusterId: clusterId || undefined,
      clusterName: selectedCluster?.name,
      taskCategory: resolvedCategory,
      taskContent: taskContent.trim(),
      resultContent: resultContent.trim() || undefined,
      scheduledAt,
      completedAt: completedAt || undefined,
      priority,
      remarks: remarks.trim() || undefined,
    });
    onClose();
  };

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const labelClass = 'block text-sm font-medium mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">
            {editTask ? '작업 수정' : '작업 등록'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>담당자 *</label>
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="이름"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>대상 클러스터</label>
              <select
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                className={inputClass}
              >
                <option value="">— 선택 안 함 —</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>작업 분류 *</label>
              <div className="flex gap-2">
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className={`${inputClass} flex-1`}
                  required={taskCategory !== '기타'}
                >
                  <option value="">— 선택 —</option>
                  {TASK_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {taskCategory === '기타' && (
                  <input
                    type="text"
                    value={taskCategoryCustom}
                    onChange={(e) => setTaskCategoryCustom(e.target.value)}
                    placeholder="직접 입력"
                    className={`${inputClass} flex-1`}
                    required
                  />
                )}
              </div>
            </div>
            <div>
              <label className={labelClass}>우선순위 *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>작업 내용 *</label>
            <textarea
              value={taskContent}
              onChange={(e) => setTaskContent(e.target.value)}
              placeholder="수행할 작업을 상세히 기술하세요"
              rows={4}
              className={`${inputClass} resize-none`}
              required
            />
          </div>

          <div>
            <label className={labelClass}>작업 결과</label>
            <textarea
              value={resultContent}
              onChange={(e) => setResultContent(e.target.value)}
              placeholder="작업 결과를 기술하세요 (선택 사항)"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>작업 예정일 *</label>
              <input
                type="date"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>작업 완료일</label>
              <input
                type="date"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>비고</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="추가 메모 (선택 사항)"
              className={inputClass}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              {editTask ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
