import { memo } from 'react';
import type { GridSelection } from '@/hooks/useGridSelection';

interface Props {
  row: string;
  col: string;
  selection: GridSelection;
  children: React.ReactNode;
  className?: string;
  onDoubleClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
  /** 편집 모드 등에서 선택 highlight 을 잠시 꺼야 할 때 */
  disabled?: boolean;
}

/** td wrapper — useGridSelection 상태에 따라 범위/활성 셀을 색상으로 표시.
 *  엑셀 유사 블록 선택 UX:
 *    - mousedown: 새 selection 시작 (shift 면 extend)
 *    - mousemove(드래그 중): 범위 확장
 *    - dblclick: 사용자 지정 편집 진입 (옵션)
 */
function GridCellBase({
  row, col, selection, children, className = '', onDoubleClick, disabled = false,
}: Props) {
  const coord = { row, col };
  const active = !disabled && selection.isActive(coord);
  const inRange = !disabled && selection.isInRange(coord);

  const clsParts: string[] = ['transition-colors select-none'];
  if (active) {
    clsParts.push('ring-2 ring-inset ring-primary bg-primary/10');
  } else if (inRange) {
    clsParts.push('bg-primary/10');
  }
  clsParts.push(className);

  return (
    <td
      data-grid-row={row}
      data-grid-col={col}
      className={clsParts.join(' ')}
      onMouseDown={(e) => {
        if (disabled) return;
        // 편집용 input 내부 클릭은 무시
        const t = e.target as HTMLElement;
        if (t.closest('input, textarea, select, button, a')) return;
        if (e.button !== 0) return;
        selection.startSelect(coord, { extend: e.shiftKey });
        e.preventDefault();
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (e.buttons === 1 && selection.isDragging) {
          selection.extendSelect(coord);
        }
      }}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </td>
  );
}

export const GridCell = memo(GridCellBase);
