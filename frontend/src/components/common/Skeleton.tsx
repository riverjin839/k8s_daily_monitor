import { memo } from 'react';

interface SkeletonProps {
  className?: string;
  /** Inline 스타일로 높이/너비 지정 */
  width?: string | number;
  height?: string | number;
  /** 원형 */
  circle?: boolean;
}

/** 단일 skeleton 블록 — shimmer 애니메이션. prefers-reduced-motion 시 정적 배경. */
function SkeletonBase({ className = '', width, height, circle = false }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;
  return (
    <span
      className={`inline-block align-middle skeleton-shimmer ${circle ? 'rounded-full' : ''} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
export const Skeleton = memo(SkeletonBase);

/** 테이블 행 skeleton — columns 개수만큼 셀 */
export function SkeletonRow({ columns = 5, cellHeight = 12 }: { columns?: number; cellHeight?: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton height={cellHeight} width={`${60 + ((i * 17) % 40)}%`} />
        </td>
      ))}
    </tr>
  );
}

/** 여러 행 — 테이블 tbody 안에 깔끔하게 */
export function SkeletonTable({ rows = 5, columns = 5, cellHeight = 12 }: {
  rows?: number; columns?: number; cellHeight?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <SkeletonRow key={r} columns={columns} cellHeight={cellHeight} />
      ))}
    </>
  );
}

/** 카드형 skeleton — 통계 카드 등 그리드 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4 space-y-2 ${className}`}>
      <Skeleton width="40%" height={10} />
      <Skeleton width="70%" height={22} />
    </div>
  );
}
