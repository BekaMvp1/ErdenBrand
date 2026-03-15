/**
 * Хук для навигации по сетке инпутов стрелками (← → ↑ ↓).
 * Возвращает registerRef(row, col) и handleKeyDown(row, col) для привязки к input в таблице/матрице.
 */
import { useRef, useCallback } from 'react';

export function useGridNavigation(rowCount, colCount) {
  const refs = useRef({});

  const registerRef = useCallback((row, col) => (el) => {
    refs.current[`${row},${col}`] = el;
  }, []);

  const handleKeyDown = useCallback(
    (row, col) => (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      let nextRow = row;
      let nextCol = col;
      if (e.key === 'ArrowLeft' && col > 0) nextCol = col - 1;
      else if (e.key === 'ArrowRight' && col < colCount - 1) nextCol = col + 1;
      else if (e.key === 'ArrowUp' && row > 0) nextRow = row - 1;
      else if (e.key === 'ArrowDown' && row < rowCount - 1) nextRow = row + 1;
      else return;
      const key = `${nextRow},${nextCol}`;
      const el = refs.current[key];
      if (el && typeof el.focus === 'function') {
        e.preventDefault();
        el.focus();
      }
    },
    [rowCount, colCount]
  );

  return { registerRef, handleKeyDown };
}
