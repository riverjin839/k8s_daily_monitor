import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Issue, IssueCreate } from '@/types';
import { loadIssueImages } from '@/lib/issueImages';
import { RichTextEditor } from '@/components/editor';
import { useAssignees } from '@/hooks/useAssignees';

interface IssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IssueCreate, images: string[]) => void;
  clusters: { id: string; name: string }[];
  editIssue?: Issue | null;
}

const ISSUE_AREAS = [
  'API Server',
  'etcd',
  'Node',
  'Network',
  'Storage / PVC',
  'System Pod',
  'ArgoCD',
  'Jenkins',
  'Keycloak',
  'Nexus',
  'Monitoring',
  '기타',
];

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

export function IssueModal({ isOpen, onClose, onSubmit, clusters, editIssue }: IssueModalProps) {
  const { data: registeredAssignees = [] } = useAssignees();
  const [assignee, setAssignee] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [issueArea, setIssueArea] = useState('');
  const [issueAreaCustom, setIssueAreaCustom] = useState('');
  const [issueContent, setIssueContent] = useState('');
  const [actionContent, setActionContent] = useState('');
  const [detailContent, setDetailContent] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayDatetimeLocal());
  const [resolvedAt, setResolvedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState<string[]>([]);

  // Pre-fill when editing
  useEffect(() => {
    if (editIssue) {
      setAssignee(editIssue.assignee);
      setClusterId(editIssue.clusterId ?? '');
      const predefined = ISSUE_AREAS.includes(editIssue.issueArea);
      setIssueArea(predefined ? editIssue.issueArea : '기타');
      setIssueAreaCustom(predefined ? '' : editIssue.issueArea);
      setIssueContent(editIssue.issueContent);
      setActionContent(editIssue.actionContent ?? '');
      setDetailContent(editIssue.detailContent ?? '');
      setOccurredAt(toDatetimeLocal(editIssue.occurredAt));
      setResolvedAt(toDatetimeLocal(editIssue.resolvedAt));
      setRemarks(editIssue.remarks ?? '');
      setImages(loadIssueImages(editIssue.id));
    } else {
      setAssignee('');
      setClusterId('');
      setIssueArea('');
      setIssueAreaCustom('');
      setIssueContent('');
      setActionContent('');
      setDetailContent('');
      setOccurredAt(todayDatetimeLocal());
      setResolvedAt('');
      setRemarks('');
      setImages([]);
    }
  }, [editIssue, isOpen]);

  const handleImagePaste = (dataUrl: string) => {
    setImages((prev) => [...prev, dataUrl]);
  };

  if (!isOpen) return null;

  const resolvedIssueArea = issueArea === '기타' ? issueAreaCustom.trim() : issueArea;
  const selectedCluster = clusters.find((c) => c.id === clusterId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const plainIssueContent = issueContent.replace(/<[^>]*>/g, '').trim();
    if (!assignee.trim() || !resolvedIssueArea || !plainIssueContent || !occurredAt) return;

    onSubmit(
      {
        assignee: assignee.trim(),
        clusterId: clusterId || undefined,
        clusterName: selectedCluster?.name,
        issueArea: resolvedIssueArea,
        issueContent,
        actionContent: actionContent || undefined,
        detailContent: detailContent || undefined,
        occurredAt,
        resolvedAt: resolvedAt || null,
        remarks: remarks.trim() || undefined,
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
            {editIssue ? '이슈 수정' : '이슈 등록'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 담당자 */}
            <div>
              <label className={labelClass}>담당자 *</label>
              <input
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="이름"
                className={inputClass}
                required
                list="issue-assignee-list"
              />
              <datalist id="issue-assignee-list">
                {registeredAssignees.map((a) => (
                  <option key={a.name} value={a.name} />
                ))}
              </datalist>
            </div>

            {/* 대상 클러스터 */}
            <div>
              <label className={labelClass}>대상 클러스터</label>
              <select
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                className={inputClass}
              >
                <option value="">— 선택 안 함 —</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 이슈 부분 */}
          <div>
            <label className={labelClass}>이슈 부분 *</label>
            <div className="flex gap-2">
              <select
                value={issueArea}
                onChange={(e) => setIssueArea(e.target.value)}
                className={`${inputClass} flex-1`}
                required={issueArea !== '기타'}
              >
                <option value="">— 선택 —</option>
                {ISSUE_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
              {issueArea === '기타' && (
                <input
                  type="text"
                  value={issueAreaCustom}
                  onChange={(e) => setIssueAreaCustom(e.target.value)}
                  placeholder="직접 입력"
                  className={`${inputClass} flex-1`}
                  required
                />
              )}
            </div>
          </div>

          {/* 이슈 내용 */}
          <div>
            <label className={labelClass}>이슈 내용 *</label>
            <RichTextEditor
              value={issueContent}
              onChange={setIssueContent}
              placeholder="발생한 이슈를 상세히 기술하세요"
              minHeight="120px"
              onImagePaste={handleImagePaste}
            />
          </div>

          {/* 조치 내용 */}
          <div>
            <label className={labelClass}>조치 내용</label>
            <RichTextEditor
              value={actionContent}
              onChange={setActionContent}
              placeholder="취한 조치를 기술하세요 (선택 사항)"
              minHeight="96px"
              onImagePaste={handleImagePaste}
            />
          </div>

          {/* 상세 내용 */}
          <div>
            <label className={labelClass}>상세 내용</label>
            <RichTextEditor
              value={detailContent}
              onChange={setDetailContent}
              placeholder="추가적인 상세 내용, 로그, 재현 방법 등을 기술하세요 (선택 사항)"
              minHeight="120px"
              onImagePaste={handleImagePaste}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 이슈 발생일시 */}
            <div>
              <label className={labelClass}>이슈 발생일시 *</label>
              <input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            {/* 이슈 조치일시 */}
            <div>
              <label className={labelClass}>이슈 조치일시</label>
              <input
                type="datetime-local"
                value={resolvedAt}
                onChange={(e) => setResolvedAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* 비고 */}
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

          {/* Actions */}
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
              {editIssue ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
