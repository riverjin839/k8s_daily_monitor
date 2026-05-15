import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { IssueForm } from '@/components/issues';
import { useIssues } from '@/hooks/useIssues';

export function IssueFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const { data: listData } = useIssues();
  const editIssue = isEdit ? listData?.data.find((x) => x.id === id) ?? null : null;

  // 수정 모드인데 캐시 로드 후에도 못 찾으면 not-found 안내.
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

  const pageTitle = isEdit ? '이슈 수정' : '이슈 등록';

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-2.5 flex items-center gap-2">
          <button
            onClick={() => navigate('/issues')}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="목록으로"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{pageTitle}</span>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-6 pt-4 pb-6">
        <div className="mb-3">
          <h1 className="text-xl font-bold text-foreground tracking-tight">{pageTitle}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isEdit
              ? '필요한 항목을 수정한 뒤 저장 버튼을 누르세요.'
              : '담당자/영역/발생일 후 이슈 내용을 작성하세요. 조치·상세·옵션은 접혀 있습니다.'}
          </p>
        </div>

        <IssueForm
          initial={editIssue ?? undefined}
          onCancel={() => navigate('/issues')}
          onSaved={() => navigate('/issues')}
        />
      </main>
    </div>
  );
}
