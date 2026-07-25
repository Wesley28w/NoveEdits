import React from 'react';
import type { Track } from '@shared/types';

export const TrackRow = React.forwardRef<
  HTMLDivElement,
  {
    track: Track;
    widthPx: number;
    isDropTarget: boolean;
    onLaneClick: (clientX: number) => void;
    onExternalDrop: (clientX: number, dataTransfer: DataTransfer) => void;
    children: React.ReactNode;
  }
>(function TrackRow({ track, widthPx, isDropTarget, onLaneClick, onExternalDrop, children }, ref) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      <div
        style={{
          width: 120,
          flexShrink: 0,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {track.name}
      </div>
      <div
        ref={ref}
        onClick={(e) => onLaneClick(e.clientX)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onExternalDrop(e.clientX, e.dataTransfer);
        }}
        style={{
          position: 'relative',
          height: 50,
          width: Math.max(widthPx, 100),
          background: isDropTarget ? 'var(--accent-soft)' : 'transparent',
        }}
      >
        {children}
      </div>
    </div>
  );
});
