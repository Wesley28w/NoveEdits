import React from 'react';

function formatShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CANDIDATE_INTERVALS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

export function TimeRuler({
  totalSec,
  pxPerSec,
  onSeek,
}: {
  totalSec: number;
  pxPerSec: number;
  onSeek: (sec: number) => void;
}) {
  const interval = CANDIDATE_INTERVALS.find((c) => c * pxPerSec >= 60) ?? 300;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSec + interval; t += interval) ticks.push(t);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const seek = (clientX: number) => onSeek(Math.max(0, (clientX - rect.left) / pxPerSec));
    seek(e.clientX);
    function move(ev: PointerEvent) {
      seek(ev.clientX);
    }
    function up() {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 120, flexShrink: 0 }} />
      <div
        onPointerDown={handlePointerDown}
        style={{ position: 'relative', height: 22, width: Math.max(totalSec * pxPerSec, 100), cursor: 'pointer' }}
      >
        {ticks.map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute',
              left: t * pxPerSec,
              top: 0,
              bottom: 0,
              borderLeft: '1px solid var(--border)',
              paddingLeft: 4,
              fontSize: 10,
              color: 'var(--muted)',
            }}
          >
            {formatShort(t)}
          </div>
        ))}
      </div>
    </div>
  );
}
