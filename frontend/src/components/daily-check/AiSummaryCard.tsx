import { useState } from 'react';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { MacCard } from '@/components/ui/MacCard';
import { useRegenerateReview } from '@/hooks/useDeepCheck';
import type { DeepCheckReview } from '@/types';

interface Props {
  review: DeepCheckReview;
}

export function AiSummaryCard({ review }: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const regenerate = useRegenerateReview();

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerate.mutateAsync(review.dailyCheckLogId);
    } finally {
      setRegenerating(false);
    }
  };

  const offline = review.aiStatus !== 'ok';

  return (
    <MacCard title="AI 자동 리뷰">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>
              {review.aiGeneratedAt
                ? new Date(review.aiGeneratedAt).toLocaleString('ko-KR')
                : '아직 생성되지 않음'}
            </span>
            {offline && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" />
                Ollama 오프라인 — fallback 메시지
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`}
            />
            재생성
          </button>
        </div>

        {review.aiSummary ? (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {review.aiSummary}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            아직 AI 리뷰가 생성되지 않았습니다. "재생성" 버튼을 눌러 수동으로 요청할 수 있습니다.
          </div>
        )}

        {review.aiRemediation && (
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              조치 권고
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {review.aiRemediation}
            </div>
          </div>
        )}
      </div>
    </MacCard>
  );
}
