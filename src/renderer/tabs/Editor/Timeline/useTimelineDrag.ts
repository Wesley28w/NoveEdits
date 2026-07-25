import { useCallback, useRef } from 'react';

/** Generic pointer-drag hook: reports live pixel delta during drag, and a final commit delta on release. */
export function useDragHandle(onDelta: (dxPx: number, dyPx: number) => void, onCommit: (dxPx: number, dyPx: number) => void) {
  const stateRef = useRef<{ startX: number; startY: number; lastDx: number; lastDy: number } | null>(null);

  return useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      stateRef.current = { startX: e.clientX, startY: e.clientY, lastDx: 0, lastDy: 0 };

      function handleMove(ev: PointerEvent) {
        if (!stateRef.current) return;
        stateRef.current.lastDx = ev.clientX - stateRef.current.startX;
        stateRef.current.lastDy = ev.clientY - stateRef.current.startY;
        onDelta(stateRef.current.lastDx, stateRef.current.lastDy);
      }
      function handleUp() {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        const final = stateRef.current;
        stateRef.current = null;
        onCommit(final?.lastDx ?? 0, final?.lastDy ?? 0);
      }
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
    [onDelta, onCommit],
  );
}
