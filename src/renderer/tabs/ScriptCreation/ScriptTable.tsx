import React from 'react';
import { randomUUID } from '../../lib/uuid';
import type { Script } from '@shared/types';
import { ScriptRowEditor } from './ScriptRow';

export function ScriptTable({ script, onChange }: { script: Script; onChange: (script: Script) => void }) {
  function addRow() {
    onChange({ ...script, rows: [...script.rows, { id: randomUUID(), said: '', shown: '' }] });
  }

  function updateRow(index: number, row: Script['rows'][number]) {
    const rows = [...script.rows];
    rows[index] = row;
    onChange({ ...script, rows });
  }

  function deleteRow(index: number) {
    const rows = script.rows.filter((_, i) => i !== index);
    onChange({ ...script, rows });
  }

  function moveRow(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= script.rows.length) return;
    const rows = [...script.rows];
    [rows[index], rows[target]] = [rows[target], rows[index]];
    onChange({ ...script, rows });
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 1fr 32px',
          gap: 10,
          paddingBottom: 8,
          borderBottom: '2px solid var(--fg)',
        }}
      >
        <div />
        <div className="panel-title" style={{ margin: 0 }}>
          Said
        </div>
        <div className="panel-title" style={{ margin: 0 }}>
          Shown
        </div>
        <div />
      </div>

      {script.rows.map((row, i) => (
        <ScriptRowEditor
          key={row.id}
          row={row}
          index={i}
          onChange={(r) => updateRow(i, r)}
          onDelete={() => deleteRow(i)}
          onMoveUp={() => moveRow(i, -1)}
          onMoveDown={() => moveRow(i, 1)}
        />
      ))}

      <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={addRow}>
        + Add Row
      </button>
    </div>
  );
}
