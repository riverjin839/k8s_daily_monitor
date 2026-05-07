import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ListTodo } from 'lucide-react';
import { TaskForm } from '@/components/tasks';
import { useTasks } from '@/hooks/useTasks';

export function TaskFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const parentId = searchParams.get('parentId') || undefined;

  const { data: listData } = useTasks();
  const editTask = isEdit ? listData?.data.find((x) => x.id === id) ?? null : null;
  const parentTask = parentId ? listData?.data.find((x) => x.id === parentId) ?? null : null;

  if (isEdit && listData && !editTask) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-[1200px] mx-auto px-8 py-8">
          <div className="text-center py-20">
            <ListTodo className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">작업을 찾을 수 없습니다.</p>
            <button
              onClick={() => navigate('/tasks')}
              className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
            >
              작업 목록으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  const pageTitle = parentTask ? '하위 작업 등록' : isEdit ? '작업 수정' : '작업 등록';

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-2.5 flex items-center gap-2">
          <button
            onClick={() => navigate('/tasks')}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="목록으로"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <ListTodo className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{pageTitle}</span>
          {parentTask && (
            <span className="ml-2 text-xs text-muted-foreground/80 truncate max-w-[400px]">
              ↳ 상위:&nbsp;
              <span className="text-foreground/80">
                {parentTask.taskContent.replace(/<[^>]*>/g, '').slice(0, 60)}
                {parentTask.taskContent.replace(/<[^>]*>/g, '').length > 60 ? '…' : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {parentTask
              ? '상위 작업의 분류와 담당자가 자동으로 채워집니다.'
              : isEdit
                ? '필요한 항목을 수정한 뒤 폼 하단의 저장 버튼을 누르세요.'
                : '담당자, 분류, 일정을 입력하고 작업 내용을 작성하세요.'}
          </p>
        </div>

        <TaskForm
          initial={editTask ?? undefined}
          parentTask={parentTask}
          onCancel={() => navigate('/tasks')}
          onSaved={() => navigate('/tasks')}
        />
      </main>
    </div>
  );
}
