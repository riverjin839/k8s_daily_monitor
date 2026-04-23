import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** 셀 좌표 — 순서 중요. 문자열 rowId 와 colKey 로 관리.
 *  정렬/페이징에 안전하게 하기 위해 숫자 인덱스 대신 식별자 사용.
 */
export interface GridCoord {
  row: string;
  col: string;
}

/** 정렬을 위한 숫자 좌표 */
export interface GridIndex {
  rowIdx: number;
  colIdx: number;
}

interface UseGridSelectionOptions {
  /** 현재 화면에 렌더된 행 ID 순서 */
  rowIds: string[];
  /** 컬럼 키 순서 (좌→우) */
  colKeys: string[];
  /** copy 시 row/col 좌표 → 문자열 셀 값 반환 함수. 없으면 텍스트 복사 비활성. */
  getCellText?: (coord: GridCoord) => string | undefined;
  /** 선택이 동작할 최상위 element ref — 이 내부 mouseup/keydown 만 처리 */
  containerRef?: React.RefObject<HTMLElement>;
}

export interface GridSelection {
  anchor: GridCoord | null;          // 시작점
  focus: GridCoord | null;           // 현재 초점 (드래그 끝점 / 커서)
  isDragging: boolean;
  // API
  startSelect: (coord: GridCoord, opts?: { extend?: boolean }) => void;
  extendSelect: (coord: GridCoord) => void;
  endSelect: () => void;
  clear: () => void;
  isInRange: (coord: GridCoord) => boolean;
  isActive: (coord: GridCoord) => boolean;
  rangeSize: number;
}

export function useGridSelection({
  rowIds, colKeys, getCellText, containerRef,
}: UseGridSelectionOptions): GridSelection {
  const [anchor, setAnchor] = useState<GridCoord | null>(null);
  const [focus, setFocus] = useState<GridCoord | null>(null);
  const [isDragging, setDragging] = useState(false);

  // 빠른 인덱스 조회용 맵
  const rowIdxMap = useMemo(() => {
    const m = new Map<string, number>();
    rowIds.forEach((r, i) => m.set(r, i));
    return m;
  }, [rowIds]);
  const colIdxMap = useMemo(() => {
    const m = new Map<string, number>();
    colKeys.forEach((c, i) => m.set(c, i));
    return m;
  }, [colKeys]);

  const toIdx = useCallback((c: GridCoord): GridIndex | null => {
    const r = rowIdxMap.get(c.row);
    const co = colIdxMap.get(c.col);
    if (r === undefined || co === undefined) return null;
    return { rowIdx: r, colIdx: co };
  }, [rowIdxMap, colIdxMap]);

  const rangeBounds = useMemo(() => {
    if (!anchor || !focus) return null;
    const a = toIdx(anchor), f = toIdx(focus);
    if (!a || !f) return null;
    return {
      minRow: Math.min(a.rowIdx, f.rowIdx),
      maxRow: Math.max(a.rowIdx, f.rowIdx),
      minCol: Math.min(a.colIdx, f.colIdx),
      maxCol: Math.max(a.colIdx, f.colIdx),
    };
  }, [anchor, focus, toIdx]);

  const rangeSize = useMemo(() => {
    if (!rangeBounds) return 0;
    return (rangeBounds.maxRow - rangeBounds.minRow + 1) * (rangeBounds.maxCol - rangeBounds.minCol + 1);
  }, [rangeBounds]);

  const isInRange = useCallback((coord: GridCoord) => {
    if (!rangeBounds) return false;
    const i = toIdx(coord);
    if (!i) return false;
    return (
      i.rowIdx >= rangeBounds.minRow && i.rowIdx <= rangeBounds.maxRow
      && i.colIdx >= rangeBounds.minCol && i.colIdx <= rangeBounds.maxCol
    );
  }, [rangeBounds, toIdx]);

  const isActive = useCallback((coord: GridCoord) => {
    return !!anchor && anchor.row === coord.row && anchor.col === coord.col;
  }, [anchor]);

  const startSelect = useCallback((coord: GridCoord, opts?: { extend?: boolean }) => {
    if (opts?.extend && anchor) {
      setFocus(coord);
    } else {
      setAnchor(coord);
      setFocus(coord);
    }
    setDragging(true);
  }, [anchor]);

  const extendSelect = useCallback((coord: GridCoord) => {
    setFocus(coord);
  }, []);

  const endSelect = useCallback(() => {
    setDragging(false);
  }, []);

  const clear = useCallback(() => {
    setAnchor(null);
    setFocus(null);
    setDragging(false);
  }, []);

  // ── 전역 mouseup — 드래그 종료 ──────────────────────────────────────────
  const draggingRef = useRef(isDragging);
  draggingRef.current = isDragging;
  useEffect(() => {
    const handler = () => {
      if (draggingRef.current) setDragging(false);
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  // ── ESC 로 선택 해제 + Ctrl/Cmd+C 복사 ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 편집 중인 input/textarea 에서는 무시
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

      const container = containerRef?.current;
      if (container && !container.contains(document.activeElement) && document.activeElement !== document.body) return;

      if (e.key === 'Escape') {
        clear();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && rangeBounds && getCellText) {
        const lines: string[] = [];
        for (let r = rangeBounds.minRow; r <= rangeBounds.maxRow; r++) {
          const rowId = rowIds[r];
          const cells: string[] = [];
          for (let c = rangeBounds.minCol; c <= rangeBounds.maxCol; c++) {
            const colKey = colKeys[c];
            const v = getCellText({ row: rowId, col: colKey }) ?? '';
            cells.push(String(v).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
          }
          lines.push(cells.join('\t'));
        }
        const tsv = lines.join('\n');
        navigator.clipboard?.writeText(tsv).catch(() => { /* ignore */ });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clear, rangeBounds, getCellText, rowIds, colKeys, containerRef]);

  return {
    anchor, focus, isDragging,
    startSelect, extendSelect, endSelect, clear,
    isInRange, isActive, rangeSize,
  };
}
