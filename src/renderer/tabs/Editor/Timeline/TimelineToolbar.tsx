import React from 'react';
import type { TrackKind } from '@shared/types';

const TRACK_KIND_LABELS: Record<TrackKind, string> = {
  video: 'Video Track',
  overlay: 'Overlay Track',
  music: 'Music Track',
  sfx: 'SFX Track',
  caption: 'Caption Track',
};

export function TimelineToolbar({
  pxPerSec,
  onZoomChange,
  onSplit,
  onCopy,
  onPaste,
  onDelete,
  canSplit,
  canCopy,
  canPaste,
  canDelete,
  subtitlesEnabled,
  onToggleSubtitles,
  onAddTrack,
}: {
  pxPerSec: number;
  onZoomChange: (px: number) => void;
  onSplit: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  canSplit: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  subtitlesEnabled: boolean;
  onToggleSubtitles: (enabled: boolean) => void;
  onAddTrack: (kind: TrackKind) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', flexWrap: 'wrap' }}>
      <button className="btn" onClick={onSplit} disabled={!canSplit} title="Split at playhead">
        ✂ Split
      </button>
      <button className="btn" onClick={onCopy} disabled={!canCopy} title="Copy selected">
        ⧉ Copy
      </button>
      <button className="btn" onClick={onPaste} disabled={!canPaste} title="Paste at playhead">
        📋 Paste
      </button>
      <button className="btn btn-danger" onClick={onDelete} disabled={!canDelete} title="Delete selected">
        Delete
      </button>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
      <select
        className="text-input"
        style={{ width: 140 }}
        value=""
        onChange={(e) => {
          if (e.target.value) onAddTrack(e.target.value as TrackKind);
          e.target.value = '';
        }}
      >
        <option value="">+ Add Track…</option>
        {(Object.keys(TRACK_KIND_LABELS) as TrackKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {TRACK_KIND_LABELS[kind]}
          </option>
        ))}
      </select>
      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input type="checkbox" checked={subtitlesEnabled} onChange={(e) => onToggleSubtitles(e.target.checked)} />
        Captions on
      </label>
      <div style={{ flex: 1 }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
        Zoom
        <input
          type="range"
          min={5}
          max={300}
          value={pxPerSec}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          style={{ accentColor: 'var(--accent)' }}
        />
      </label>
    </div>
  );
}
