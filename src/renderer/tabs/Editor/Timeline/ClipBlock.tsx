import React, { useState } from 'react';
import { useDragHandle } from './useTimelineDrag';

const MIN_DURATION_SEC = 0.1;

export function ClipBlock({
  label,
  startSec,
  durationSec,
  pxPerSec,
  color,
  selected,
  onSelect,
  onDragMove,
  onDragCommit,
  onTrimLeftCommit,
  onTrimRightCommit,
  previewDeltaSec,
}: {
  label: string;
  startSec: number;
  durationSec: number;
  pxPerSec: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
  /** Live feedback during a cross-track drag: reports pointer client coords so the parent Timeline can hit-test track rows. */
  onDragMove: (clientX: number, clientY: number, deltaSecFromStart: number) => void;
  onDragCommit: (clientX: number, clientY: number, deltaSecFromStart: number) => void;
  onTrimLeftCommit: (newStartSec: number, newDurationSec: number) => void;
  onTrimRightCommit: (newDurationSec: number) => void;
  /** Horizontal preview offset (seconds) applied while this block is the one being dragged. */
  previewDeltaSec: number;
}) {
  const [trimLeftPx, setTrimLeftPx] = useState(0);
  const [trimRightPx, setTrimRightPx] = useState(0);

  function handleBodyPointerDown(e: React.PointerEvent) {
    const startX = e.clientX;
    e.stopPropagation();
    e.preventDefault();

    function handleMove(ev: PointerEvent) {
      onDragMove(ev.clientX, ev.clientY, (ev.clientX - startX) / pxPerSec);
    }
    function handleUp(ev: PointerEvent) {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      onDragCommit(ev.clientX, ev.clientY, (ev.clientX - startX) / pxPerSec);
    }
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }

  const leftDrag = useDragHandle(
    (dx) => setTrimLeftPx(dx),
    (dx) => {
      setTrimLeftPx(0);
      const deltaSec = dx / pxPerSec;
      const newStart = Math.max(0, Math.min(startSec + durationSec - MIN_DURATION_SEC, startSec + deltaSec));
      const newDuration = startSec + durationSec - newStart;
      onTrimLeftCommit(newStart, newDuration);
    },
  );

  const rightDrag = useDragHandle(
    (dx) => setTrimRightPx(dx),
    (dx) => {
      setTrimRightPx(0);
      const deltaSec = dx / pxPerSec;
      const newDuration = Math.max(MIN_DURATION_SEC, durationSec + deltaSec);
      onTrimRightCommit(newDuration);
    },
  );

  const left = startSec * pxPerSec + trimLeftPx + previewDeltaSec * pxPerSec;
  const width = Math.max(4, durationSec * pxPerSec - trimLeftPx + trimRightPx);

  return (
    <div
      onPointerDown={handleBodyPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        position: 'absolute',
        left,
        width,
        top: 3,
        bottom: 3,
        background: color,
        borderRadius: 4,
        border: selected ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.25)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      <div onPointerDown={leftDrag} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize' }} />
      <span
        style={{
          fontSize: 11,
          padding: '0 9px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
      <div onPointerDown={rightDrag} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 7, cursor: 'ew-resize' }} />
    </div>
  );
}
