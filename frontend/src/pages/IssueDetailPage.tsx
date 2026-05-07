import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { IssueForm, IssueReadView } from '@/components/issues';
import { useIssues, useDeleteIssue } from '@/hooks/useIssues';

export function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const editMode = location.pathname.endsWith('/edit');

  const { data: listData } = useIssues();
  const issue = listData?.data.find((x) => x.id === id) ?? null;
  const deleteIssue = useDeleteIssue();

  // 캐시 로드 후에도 못 찾으면 not-found.
  if (listData && !issue) {
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

  if (!issue) {
    // 첫 로드 중. 빈 화면 (간단한 스켈레톤 정도면 충분 — 캐시 채워지면 즉시 렌더).
    return <div className="min-h-screen bg-background" />;
  }

  const handleDelete = () => {
    if (!confirm(`"${issue.issueArea}" 이슈를 삭제하시겠습니까?`)) return;
    deleteIssue.mutate(issue.id);
    localStorage.removeItem('k8s:img:issue:' + issue.id);
    navigate('/issues');
  };

  const pageTitle = editMode ? '이슈 수정' : '이슈 상세';

  return (
    <div className="min-h-screen bg-background">
      {/* sticky 헤더 — 좌측: 목록으로 / 좌측 라벨 / 우측: 수정·삭제 (read) 또는 안내 (edit) */}
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
          {!editMode && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => navigate(`/issues/${issue.id}/edit`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> 수정
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 border border-border rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
        {editMode ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">이슈 수정</h1>
              <p className="text-sm text-muted-foreground mt-1">필요한 항목을 수정한 뒤 폼 하단의 저장 버튼을 누르세요.</p>
            </div>
            <IssueForm
              initial={issue}
              onCancel={() => navigate(`/issues/${issue.id}`)}
              onSaved={() => navigate(`/issues/${issue.id}`)}
            />
          </>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 mac-shadow">
            <IssueReadView issue={issue} />
          </div>
        )}
      </main>
    </div>
  );
}
