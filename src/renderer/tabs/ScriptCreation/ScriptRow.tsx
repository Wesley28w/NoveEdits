import React from 'react';
import type { ScriptRow as ScriptRowType } from '@shared/types';
import { useAutoGrow } from '../../lib/useAutoGrow';

export function ScriptRowEditor({
  row,
  index,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  row: ScriptRowType;
  index: number;
  onChange: (row: ScriptRowType) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const saidRef = useAutoGrow(row.said);
  const shownRef = useAutoGrow(row.shown);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 1fr 32px',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{index + 1}</span>
        <button title="Move up" className="btn" style={{ padding: '1px 6px', fontSize: 10 }} onClick={onMoveUp}>
          ↑
        </button>
        <button title="Move down" className="btn" style={{ padding: '1px 6px', fontSize: 10 }} onClick={onMoveDown}>
          ↓
        </button>
      </div>
      <textarea
        ref={saidRef}
        className="text-input"
        placeholder="What is said (voiceover / dialogue)…"
        rows={1}
        style={{ resize: 'none', overflow: 'hidden', minHeight: 40 }}
        value={row.said}
        onChange={(e) => onChange({ ...row, said: e.target.value })}
      />
      <textarea
        ref={shownRef}
        className="text-input"
        placeholder="What is shown (visual / b-roll)…"
        rows={1}
        style={{ resize: 'none', overflow: 'hidden', minHeight: 40 }}
        value={row.shown}
        onChange={(e) => onChange({ ...row, shown: e.target.value })}
      />
      <button className="btn btn-danger" style={{ padding: '6px 8px' }} onClick={onDelete} title="Delete row">
        ✕
      </button>
    </div>
  );
}
