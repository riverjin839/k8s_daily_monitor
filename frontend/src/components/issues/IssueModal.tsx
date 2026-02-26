import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ImagePlus, Trash2 } from 'lucide-react';
import { Issue, IssueCreate } from '@/types';
import { loadIssueImages } from '@/lib/issueImages';

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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function IssueModal({ isOpen, onClose, onSubmit, clusters, editIssue }: IssueModalProps) {
  const [assignee, setAssignee] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [issueArea, setIssueArea] = useState('');
  const [issueAreaCustom, setIssueAreaCustom] = useState('');
  const [issueContent, setIssueContent] = useState('');
  const [actionContent, setActionContent] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [resolvedAt, setResolvedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const issueContentRef = useRef<HTMLTextAreaElement>(null);

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
      setOccurredAt(editIssue.occurredAt);
      setResolvedAt(editIssue.resolvedAt ?? '');
      setRemarks(editIssue.remarks ?? '');
      setImages(loadIssueImages(editIssue.id));
    } else {
      setAssignee('');
      setClusterId('');
      setIssueArea('');
      setIssueAreaCustom('');
      setIssueContent('');
      setActionContent('');
      setOccurredAt(today());
      setResolvedAt('');
      setRemarks('');
      setImages([]);
    }
  }, [editIssue, isOpen]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          setImages((prev) => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const resolvedIssueArea = issueArea === '기타' ? issueAreaCustom.trim() : issueArea;
  const selectedCluster = clusters.find((c) => c.id === clusterId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignee.trim() || !resolvedIssueArea || !issueContent.trim() || !occurredAt) return;

    onSubmit(
      {
        assignee: assignee.trim(),
        clusterId: clusterId || undefined,
        clusterName: selectedCluster?.name,
        issueArea: resolvedIssueArea,
        issueContent: issueContent.trim(),
        actionContent: actionContent.trim() || undefined,
        occurredAt,
        resolvedAt: resolvedAt || undefined,
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
              />
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
            <label className={labelClass}>
              이슈 내용 *
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (Ctrl+V 로 이미지 붙여넣기 가능)
              </span>
            </label>
            <textarea
              ref={issueContentRef}
              value={issueContent}
              onChange={(e) => setIssueContent(e.target.value)}
              onPaste={handlePaste}
              placeholder="발생한 이슈를 상세히 기술하세요"
              rows={4}
              className={`${inputClass} resize-none`}
              required
            />
          </div>

          {/* 조치 내용 */}
          <div>
            <label className={labelClass}>
              조치 내용
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                (Ctrl+V 로 이미지 붙여넣기 가능)
              </span>
            </label>
            <textarea
              value={actionContent}
              onChange={(e) => setActionContent(e.target.value)}
              onPaste={handlePaste}
              placeholder="취한 조치를 기술하세요 (선택 사항)"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Image Attachments Preview */}
          {images.length > 0 ? (
            <div>
              <label className={`${labelClass} flex items-center gap-1`}>
                <ImagePlus className="w-4 h-4" />
                첨부 이미지 ({images.length}개)
              </label>
              <div className="flex flex-wrap gap-2 mt-1">
                {images.map((src, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={src}
                      alt={`첨부 이미지 ${idx + 1}`}
                      className="w-24 h-24 object-cover rounded-lg border border-border cursor-pointer"
                      onClick={() => window.open(src, '_blank')}
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ImagePlus className="w-3.5 h-3.5" />
              내용란에 이미지를 붙여넣으면 자동으로 첨부됩니다
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* 이슈 발생일 */}
            <div>
              <label className={labelClass}>이슈 발생일 *</label>
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            {/* 이슈 조치일 */}
            <div>
              <label className={labelClass}>이슈 조치일</label>
              <input
                type="date"
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
