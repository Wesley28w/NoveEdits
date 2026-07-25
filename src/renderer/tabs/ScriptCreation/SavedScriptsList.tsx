import React from 'react';
import type { ScriptSummary } from '@shared/types';

export function SavedScriptsList({
  scripts,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onImport,
}: {
  scripts: ScriptSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onImport: () => void;
}) {
  return (
    <div className="sidebar">
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onNew}>
          + New Script
        </button>
        <button className="btn" title="Import a .novascript file" onClick={onImport}>
          Import
        </button>
      </div>
      <p className="panel-title">Saved Scripts</p>
      {scripts.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>No scripts saved yet.</p>
      )}
      {scripts.map((s) => (
        <div key={s.id} className={`saved-list-item ${s.id === activeId ? 'active' : ''}`} onClick={() => onSelect(s.id)}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
          <button
            className="btn"
            style={{ padding: '2px 6px', fontSize: 11 }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${s.title}"?`)) onDelete(s.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
