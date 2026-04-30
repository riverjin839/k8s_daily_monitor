import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Plus, Settings2 } from 'lucide-react';
import { Issue, IssueCreate, IssueUpdate } from '@/types';
import { loadIssueImages, saveIssueImages } from '@/lib/issueImages';
import { RichTextEditor } from '@/components/editor';
import { useAssignees } from '@/hooks/useAssignees';
import { useClusters } from '@/hooks/useCluster';
import { useClusterStore } from '@/stores/clusterStore';
import { useIssues, useCreateIssue, useUpdateIssue } from '@/hooks/useIssues';

const DEFAULT_ISSUE_AREAS = [
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
];
const ISSUE_AREAS = [...DEFAULT_ISSUE_AREAS, '기타'];
const AREA_STORAGE_KEY = 'k8s:issue:areas';

function loadCustomAreas(): string[] {
  try {
    const raw = localStorage.getItem(AREA_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveCustomAreas(areas: string[]) {
  localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(areas));
}

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

export function IssueFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  useClusters();
  const { clusters } = useClusterStore();
  const { data: registeredAssignees = [] } = useAssignees();
  const { data: listData } = useIssues();
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();

  const editIssue: Issue | null =
    isEdit ? listData?.data.find((x) => x.id === id) ?? null : null;

  const [primaryAssignee, setPrimaryAssignee] = useState('');
  const [secondaryAssignee, setSecondaryAssignee] = useState('');
  const [clusterId, setClusterId] = useState('');
  const [issueArea, setIssueArea] = useState('');
  const [issueAreaCustom, setIssueAreaCustom] = useState('');
  const [customAreas, setCustomAreas] = useState<string[]>(loadCustomAreas);
  const [showAreaManage, setShowAreaManage] = useState(false);
  const [newAreaInput, setNewAreaInput] = useState('');
  const [issueContent, setIssueContent] = useState('');
  const [actionContent, setActionContent] = useState('');
  const [detailContent, setDetailContent] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayDatetimeLocal());
  const [resolvedAt, setResolvedAt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(!isEdit);

  const allAreas = [...DEFAULT_ISSUE_AREAS, ...customAreas, '기타'];

  const addCustomArea = () => {
    const a = newAreaInput.trim();
    if (!a || allAreas.includes(a)) return;
    const updated = [...customAreas, a];
    setCustomAreas(updated);
    saveCustomAreas(updated);
    setNewAreaInput('');
    setIssueArea(a);
  };

  const deleteCustomArea = (a: string) => {
    const updated = customAreas.filter((x) => x !== a);
    setCustomAreas(updated);
    saveCustomAreas(updated);
    if (issueArea === a) setIssueArea('');
  };

  // Hydrate form when editing and data is available
  useEffect(() => {
    if (!isEdit || hydrated) return;
    if (!editIssue) return;
    setPrimaryAssignee(editIssue.primaryAssignee ?? editIssue.assignee);
    setSecondaryAssignee(editIssue.secondaryAssignee ?? '');
    setClusterId(editIssue.clusterId ?? '');
    const allKnown = [...ISSUE_AREAS, ...loadCustomAreas()];
    const predefined = allKnown.includes(editIssue.issueArea);
    setIssueArea(predefined ? editIssue.issueArea : '기타');
    setIssueAreaCustom(predefined ? '' : editIssue.issueArea);
    setIssueContent(editIssue.issueContent);
    setActionContent(editIssue.actionContent ?? '');
    setDetailContent(editIssue.detailContent ?? '');
    setOccurredAt(toDatetimeLocal(editIssue.occurredAt));
    setResolvedAt(toDatetimeLocal(editIssue.resolvedAt));
    setRemarks(editIssue.remarks ?? '');
    setImages(loadIssueImages(editIssue.id));
    setHydrated(true);
  }, [isEdit, editIssue, hydrated]);

  const handleImagePaste = (dataUrl: string) => {
    setImages((prev) => [...prev, dataUrl]);
  };

  const resolvedIssueArea = issueArea === '기타' ? issueAreaCustom.trim() : issueArea;
  const selectedCluster = clusters.find((c) => c.id === clusterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const plainIssueContent = issueContent.replace(/<[^>]*>/g, '').trim();
    if (!primaryAssignee.trim() || !resolvedIssueArea || !plainIssueContent || !occurredAt) return;

    const payload: IssueCreate = {
      assignee: primaryAssignee.trim(),
      primaryAssignee: primaryAssignee.trim(),
      secondaryAssignee: secondaryAssignee.trim() || undefined,
      clusterId: clusterId || undefined,
      clusterName: selectedCluster?.name,
      issueArea: resolvedIssueArea,
      issueContent,
      actionContent: actionContent || undefined,
      detailContent: detailContent || undefined,
      occurredAt,
      resolvedAt: resolvedAt || null,
      remarks: remarks.trim() || undefined,
    };

    if (isEdit && editIssue) {
      await updateIssue.mutateAsync({ id: editIssue.id, data: payload as IssueUpdate });
      saveIssueImages(editIssue.id, images);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await createIssue.mutateAsync(payload);
      const newId: string | undefined = res?.data?.id ?? res?.id;
      if (images.length > 0 && newId) saveIssueImages(newId, images);
    }
    navigate('/issues');
  };

  // Edit-mode fallback: issue not found in cache after list loaded
  if (isEdit && listData && !editIssue) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-[1200px] mx-auto px-8 py-8">
          <div className="text-center py-20">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">이슈를 찾을 수 없습니다.</p>
            <button
              onClick={() => navigate('/issues')}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
            >
              이슈 목록으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary';
  const labelClass = 'block text-sm font-medium mb-1';

  const submitting = createIssue.isPending || updateIssue.isPending;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/issues')}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              title="목록으로"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <ClipboardList className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">{isEdit ? '이슈 수정' : '이슈 등록'}</h1>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 담당자(정/부) */}
            <div>
              <label className={labelClass}>담당자(정) *</label>
              <input
                type="text"
                value={primaryAssignee}
                onChange={(e) => setPrimaryAssignee(e.target.value)}
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
              <label className={`${labelClass} mt-3`}>담당자(부)</label>
              <input
                type="text"
                value={secondaryAssignee}
                onChange={(e) => setSecondaryAssignee(e.target.value)}
                placeholder="보조 담당자"
                className={inputClass}
                list="issue-assignee-list"
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

              <div className="flex items-center justify-between mt-3 mb-1">
                <label className="text-sm font-medium">이슈 부분 *</label>
                <button
                  type="button"
                  onClick={() => setShowAreaManage((v) => !v)}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="이슈 부분 관리"
                >
                  <Settings2 className="w-3 h-3" />
                  관리
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={issueArea}
                  onChange={(e) => setIssueArea(e.target.value)}
                  className={`${inputClass} flex-1`}
                  required={issueArea !== '기타'}
                >
                  <option value="">— 선택 —</option>
                  {allAreas.map((area) => (
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
              {showAreaManage && (
                <div className="mt-2 p-3 bg-muted/20 border border-border rounded-lg space-y-2">
                  {customAreas.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">사용자 분류</p>
                      {customAreas.map((a) => (
                        <div key={a} className="flex items-center justify-between py-0.5">
                          <span className="text-xs text-foreground/80">{a}</span>
                          <button
                            type="button"
                            onClick={() => deleteCustomArea(a)}
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
                      value={newAreaInput}
                      onChange={(e) => setNewAreaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addCustomArea(); }
                      }}
                      placeholder="새 이슈 부분 입력 (예: Backup, IDM)"
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={addCustomArea}
                      className="flex items-center gap-0.5 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      추가
                    </button>
                  </div>
                </div>
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
              minHeight="180px"
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
              minHeight="140px"
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
              minHeight="180px"
              onImagePaste={handleImagePaste}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => navigate('/issues')}
              className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEdit ? '저장' : '등록'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
