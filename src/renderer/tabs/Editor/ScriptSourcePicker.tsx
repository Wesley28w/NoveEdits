import React, { useEffect, useState } from 'react';
import type { Script, ScriptSummary } from '@shared/types';
import { randomUUID } from '../../lib/uuid';

export function ScriptSourcePicker({
  initialScriptId,
  onChosen,
}: {
  initialScriptId?: string | null;
  onChosen: (script: Script) => void;
}) {
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [pasteText, setPasteText] = useState('');

  useEffect(() => {
    window.api.scripts.list().then(setScripts);
  }, []);

  useEffect(() => {
    if (initialScriptId) {
      window.api.scripts.load(initialScriptId).then((s) => {
        if (s) onChosen(s);
      });
    }
  }, [initialScriptId]);

  async function pickSaved(id: string) {
    const s = await window.api.scripts.load(id);
    if (s) onChosen(s);
  }

  function usePasted() {
    if (!pasteText.trim()) return;
    const now = new Date().toISOString();
    const rows = pasteText
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((said) => ({ id: randomUUID(), said, shown: '' }));
    onChosen({
      id: '',
      title: 'Pasted Script',
      createdAt: now,
      updatedAt: now,
      rows: rows.length ? rows : [{ id: randomUUID(), said: pasteText, shown: '' }],
    });
  }

  return (
    <div className="content" style={{ maxWidth: 720 }}>
      <h2>Start an Editor Project</h2>
      <p style={{ color: 'var(--muted)' }}>Choose a script to build the edit from.</p>

      <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <p className="panel-title">Select a Saved Script</p>
        {scripts.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No saved scripts yet.</p>}
        {scripts.map((s) => (
          <div key={s.id} className="saved-list-item" onClick={() => pickSaved(s.id)}>
            {s.title}
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <p className="panel-title">Or Paste a Script</p>
        <textarea
          className="text-input"
          rows={8}
          placeholder="Paste raw script text (each paragraph becomes a beat)…"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <button className="btn btn-primary" onClick={usePasted} disabled={!pasteText.trim()}>
          Use This Text
        </button>
      </div>
    </div>
  );
}
