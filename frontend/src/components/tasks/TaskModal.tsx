import { useState, useEffect } from 'react';
import { X, Settings2, Plus } from 'lucide-react';
import { Task, TaskCreate, KanbanStatus, TaskModule, TaskTypeLabel } from '@/types';
import { KANBAN_STATUS_LABEL, MODULE_CONFIG, TYPE_LABEL_CONFIG } from './taskKanbanUtils';
import { loadTaskImages } from '@/lib/taskImages';
import { RichTextEditor } from '@/components/editor';
import { useAssignees } from '@/hooks/useAssignees';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskCreate, images: string[]) => void;
  clusters: { id: string; name: string }[];
  editTask?: Task | null;
}

const DEFAULT_TASK_CATEGORIES = [
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
];

const TASK_CATEGORIES = [...DEFAULT_TASK_CATEGORIES, '기타'];

const CATEGORY_STORAGE_KEY = 'k8s:task:categories';

function loadCustomCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(cats: string[]) {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(cats));
}

const PRIORITIES = [
  { value: 'high', label: '높음' },
  { value: 'medium', label: '보통' },
  { value: 'low', label: '낮음' },
];

const KANBAN_STATUS_OPTIONS: KanbanStatus[] = ['backlog', 'todo', 'in_progress', 'review_test', 'done'];
const MODULE_OPTIONS = Object.entries(MODULE_CONFIG) as [TaskModule, { label: string; cls: string }][];
const TYPE_OPTIONS = Object.entries(TYPE_LABEL_CONFIG) as [TaskTypeLabel, { label: string; cls: string }][];

function todayDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocal(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskModal({ isOpen, onClose, onSubmit, clusters, editTask }: TaskModalProps) {
  const { data: registeredAssignees = [] } = useAssignees();
  const [assignee, setAssignee] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskCategoryCustom, setTaskCategoryCustom] = useState('');
  const [taskContent, setTaskContent] = useState('');
  const [resultContent, setResultContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState(todayDatetimeLocal());
  const [completedAt, setCompletedAt] = useState('');
  const [priority, setPriority] = useState('medium');
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>(loadCustomCategories);
  const [showCatManage, setShowCatManage] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  // 칸반 보드 필드
  const [kanbanStatus, setKanbanStatus] = useState<KanbanStatus>('todo');
  const [module, setModule] = useState<TaskModule | ''>('');
  const [typeLabel, setTypeLabel] = useState<TaskTypeLabel | ''>('');
  const [effortHours, setEffortHours] = useState('');
  const [doneCondition, setDoneCondition] = useState('');

  useEffect(() => {
    const allKnownCategories = [...TASK_CATEGORIES, ...loadCustomCategories()];
    if (editTask) {
      setAssignee(editTask.assignee);
      setClusterId(editTask.clusterId ?? '');
      const predefined = allKnownCategories.includes(editTask.taskCategory);
      setTaskCategory(predefined ? editTask.taskCategory : '기타');
      setTaskCategoryCustom(predefined ? '' : editTask.taskCategory);
      setTaskContent(editTask.taskContent);
      setResultContent(editTask.resultContent ?? '');
      setScheduledAt(toDatetimeLocal(editTask.scheduledAt));
      setCompletedAt(toDatetimeLocal(editTask.completedAt));
      setPriority(editTask.priority);
      setRemarks(editTask.remarks ?? '');
      setImages(loadTaskImages(editTask.id));
      setKanbanStatus(editTask.kanbanStatus ?? 'todo');
      setModule((editTask.module ?? '') as TaskModule | '');
      setTypeLabel((editTask.typeLabel ?? '') as TaskTypeLabel | '');
      setEffortHours(editTask.effortHours ? String(editTask.effortHours) : '');
      setDoneCondition(editTask.doneCondition ?? '');
    } else {
      setAssignee('');
      setClusterId('');
      setTaskCategory('');
      setTaskCategoryCustom('');
      setTaskContent('');
      setResultContent('');
      setScheduledAt(todayDatetimeLocal());
      setCompletedAt('');
      setPriority('medium');
      setRemarks('');
      setImages([]);
      setKanbanStatus('todo');
      setModule('');
      setTypeLabel('');
      setEffortHours('');
      setDoneCondition('');
    }
    setCustomCategories(loadCustomCategories());
    setShowCatManage(false);
    setNewCatInput('');
  }, [editTask, isOpen]);

  const addCustomCategory = () => {
    const cat = newCatInput.trim();
    if (!cat || TASK_CATEGORIES.includes(cat) || customCategories.includes(cat)) return;
    const updated = [...customCategories, cat];
    setCustomCategories(updated);
    saveCustomCategories(updated);
    setNewCatInput('');
    setTaskCategory(cat);
  };

  const deleteCustomCategory = (cat: string) => {
    const updated = customCategories.filter((c) => c !== cat);
    setCustomCategories(updated);
    saveCustomCategories(updated);
    if (taskCategory === cat) setTaskCategory('');
  };

  const handleImagePaste = (dataUrl: string) => {
    setImages((prev) => [...prev, dataUrl]);
  };

  if (!isOpen) return null;

  const allCategories = [...DEFAULT_TASK_CATEGORIES, ...customCategories, '기타'];
  const resolvedCategory = taskCategory === '기타' ? taskCategoryCustom.trim() : taskCategory;
  const selectedCluster = clusters.find((c) => c.id === clusterId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const plainTaskContent = taskContent.replace(/<[^>]*>/g, '').trim();
    if (!assignee.trim() || !resolvedCategory || !plainTaskContent || !scheduledAt) return;

    onSubmit(
      {
        assignee: assignee.trim(),
        clusterId: clusterId || undefined,
        clusterName: selectedCluster?.name,
        taskCategory: resolvedCategory,
        taskContent,
        resultContent: resultContent || undefined,
        scheduledAt,
        completedAt: completedAt || null,
        priority,
        remarks: remarks.trim() || undefined,
        kanbanStatus,
        module: module || undefined,
        typeLabel: typeLabel || undefined,
        effortHours: effortHours ? parseInt(effortHours, 10) : undefined,
        doneCondition: doneCondition.trim() || undefined,
      },
      images,
    );
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
                list="task-assignee-list"
              />
              <datalist id="task-assignee-list">
                {registeredAssignees.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
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
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">작업 분류 *</label>
                <button
                  type="button"
                  onClick={() => setShowCatManage((v) => !v)}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="분류 관리"
                >
                  <Settings2 className="w-3 h-3" />
                  관리
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className={`${inputClass} flex-1`}
                  required={taskCategory !== '기타'}
                >
                  <option value="">— 선택 —</option>
                  {allCategories.map((cat) => (
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
              {showCatManage && (
                <div className="mt-2 p-3 bg-muted/20 border border-border rounded-lg space-y-2">
                  {customCategories.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">사용자 분류</p>
                      {customCategories.map((cat) => (
                        <div key={cat} className="flex items-center justify-between py-0.5">
                          <span className="text-xs text-foreground/80">{cat}</span>
                          <button
                            type="button"
                            onClick={() => deleteCustomCategory(cat)}
                            className="text-xs text-muted-foreground hover:text-red-400 transition-colors px-1"
                            title="삭제"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newCatInput}
                      onChange={(e) => setNewCatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomCategory();
                        }
                      }}
                      placeholder="새 분류명 입력"
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={addCustomCategory}
                      className="flex items-center gap-0.5 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      추가
                    </button>
                  </div>
                </div>
              )}
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
            <RichTextEditor
              value={taskContent}
              onChange={setTaskContent}
              placeholder="수행할 작업을 상세히 기술하세요"
              minHeight="120px"
              onImagePaste={handleImagePaste}
            />
          </div>

          <div>
            <label className={labelClass}>작업 결과</label>
            <RichTextEditor
              value={resultContent}
              onChange={setResultContent}
              placeholder="작업 결과를 기술하세요 (선택 사항)"
              minHeight="96px"
              onImagePaste={handleImagePaste}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>작업 예정일시 *</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>작업 완료일시</label>
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* 칸반 보드 필드 ─────────────────────────────────── */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">칸반 보드</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>보드 상태</label>
                <select
                  value={kanbanStatus}
                  onChange={(e) => setKanbanStatus(e.target.value as KanbanStatus)}
                  className={inputClass}
                >
                  {KANBAN_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{KANBAN_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>모듈</label>
                <select
                  value={module}
                  onChange={(e) => setModule(e.target.value as TaskModule | '')}
                  className={inputClass}
                >
                  <option value="">— 선택 안 함 —</option>
                  {MODULE_OPTIONS.map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>유형 (type)</label>
                <select
                  value={typeLabel}
                  onChange={(e) => setTypeLabel(e.target.value as TaskTypeLabel | '')}
                  className={inputClass}
                >
                  <option value="">— 선택 안 함 —</option>
                  {TYPE_OPTIONS.map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label} ({key})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>예상 소요 시간 (h)</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={effortHours}
                  onChange={(e) => setEffortHours(e.target.value)}
                  placeholder="예: 4"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass}>
                완료 조건
                <span className="ml-1.5 text-xs text-muted-foreground font-normal">(Done 이동 기준)</span>
              </label>
              <input
                type="text"
                value={doneCondition}
                onChange={(e) => setDoneCondition(e.target.value)}
                placeholder="예: docker pull 캐시 동작 확인"
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
