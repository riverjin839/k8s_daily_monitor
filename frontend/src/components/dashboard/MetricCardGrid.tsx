import { MetricCard as MetricCardType, MetricQueryResult } from '@/types';
import { MetricCard } from './MetricCard';

interface MetricCardGridProps {
  cards: MetricCardType[];
  results: MetricQueryResult[];
  isLoading?: boolean;
  onDeleteCard?: (id: string) => void;
  onEditCard?: (card: MetricCardType) => void;
}

export function MetricCardGrid({ cards, results, isLoading, onDeleteCard, onEditCard }: MetricCardGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          No metric cards yet. Click "Add Metric" to create your first PromQL card.
        </p>
      </div>
    );
  }

  // Build a map: cardId → result for fast lookup
  const resultMap = new Map<string, MetricQueryResult>();
  for (const r of results) {
    if (r.cardId) resultMap.set(r.cardId, r);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <MetricCard
          key={card.id}
          card={card}
          result={resultMap.get(card.id)}
          onDelete={onDeleteCard ? () => onDeleteCard(card.id) : undefined}
          onEdit={onEditCard ? () => onEditCard(card) : undefined}
        />
      ))}
    </div>
  );
}
