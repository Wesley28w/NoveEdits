import React, { useEffect, useMemo, useState } from 'react';
import type { Script, ScriptSummary } from '@shared/types';
import { randomUUID } from '../../lib/uuid';
import { useToast } from '../../lib/ToastContext';
import { ScriptTable } from './ScriptTable';
import { SavedScriptsList } from './SavedScriptsList';
import { TranscribePanel } from './TranscribePanel';
import { AccountStylePanel } from './AccountStylePanel';

const WORDS_PER_SEC = 2.5;

function blankScript(): Script {
  const now = new Date().toISOString();
  return {
    id: '',
    title: 'Untitled Script',
    createdAt: now,
    updatedAt: now,
    rows: [{ id: randomUUID(), said: '', shown: '' }],
  };
}

function estimateDurationLabel(script: Script): string {
  const words = script.rows.reduce((sum, r) => sum + (r.said.trim() ? r.said.trim().split(/\s+/).length : 0), 0);
  const seconds = Math.round(words / WORDS_PER_SEC);
  if (seconds === 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `~${m}m ${s}s` : `~${s}s`;
}

export function ScriptCreationTab({ onSendToEditor }: { onSendToEditor: (scriptId: string) => void }) {
  const toast = useToast();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [script, setScript] = useState<Script>(blankScript());
  const [saving, setSaving] = useState(false);

  const durationLabel = useMemo(() => estimateDurationLabel(script), [script]);

  async function refreshList() {
    setScripts(await window.api.scripts.list());
  }

  useEffect(() => {
    refreshList();
  }, []);

  async function selectScript(id: string) {
    const loaded = await window.api.scripts.load(id);
    if (loaded) setScript(loaded);
  }

  function newScript() {
    setScript(blankScript());
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await window.api.scripts.save(script);
      setScript(saved);
      await refreshList();
      toast.success(`Saved "${saved.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save script');
    } finally {
      setSaving(false);
    }
  }

  async function duplicateScript() {
    const now = new Date().toISOString();
    const copy: Script = {
      ...script,
      id: '',
      title: `${script.title} (copy)`,
      createdAt: now,
      updatedAt: now,
      rows: script.rows.map((r) => ({ ...r, id: randomUUID() })),
    };
    const saved = await window.api.scripts.save(copy);
    setScript(saved);
    await refreshList();
    toast.success(`Duplicated as "${saved.title}"`);
  }

  async function deleteScript(id: string) {
    const target = scripts.find((s) => s.id === id);
    await window.api.scripts.delete(id);
    if (script.id === id) newScript();
    await refreshList();
    toast.show(`Deleted "${target?.title ?? 'script'}"`);
  }

  async function exportPdf() {
    if (!script.title.trim() && script.rows.length === 0) return;
    try {
      const result = await window.api.pdf.export(script);
      if (!result.canceled && result.filePath) {
        toast.success(`Exported PDF to ${result.filePath}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    }
  }

  function insertTranscript(rows: Script['rows'], sourceUrl: string, title?: string) {
    setScript({ ...blankScript(), title: title || 'Transcribed Script', sourceUrl, rows });
    toast.success('Transcript inserted as a new script');
  }

  function useRewritten(newScript: Script) {
    setScript(newScript);
    refreshList();
    toast.success(`Created "${newScript.title}"`);
  }

  async function exportScript() {
    try {
      const result = await window.api.scripts.export(script);
      if (!result.canceled && result.filePath) {
        toast.success(`Exported to ${result.filePath}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Script export failed');
    }
  }

  async function importScript() {
    try {
      const imported = await window.api.scripts.import();
      if (!imported) return;
      setScript(imported);
      await refreshList();
      toast.success(`Imported "${imported.title}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Script import failed');
    }
  }

  async function sendToEditor() {
    let id = script.id;
    if (!id) {
      const saved = await window.api.scripts.save(script);
      setScript(saved);
      id = saved.id;
      await refreshList();
    }
    onSendToEditor(id);
  }

  return (
    <>
      <SavedScriptsList
        scripts={scripts}
        activeId={script.id || null}
        onSelect={selectScript}
        onNew={newScript}
        onDelete={deleteScript}
        onImport={importScript}
      />
      <div className="content">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
          <input
            className="text-input"
            style={{ fontSize: 18, fontWeight: 700, flex: 1 }}
            value={script.title}
            onChange={(e) => setScript({ ...script, title: e.target.value })}
          />
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" onClick={duplicateScript}>
            Duplicate
          </button>
          <button className="btn" onClick={exportPdf}>
            Export PDF
          </button>
          <button className="btn" onClick={exportScript}>
            Export Script
          </button>
          <button className="btn" onClick={sendToEditor}>
            Send to Editor →
          </button>
        </div>
        {durationLabel && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px' }}>
            {script.rows.length} beat{script.rows.length === 1 ? '' : 's'} · estimated read time {durationLabel}
          </p>
        )}
        <ScriptTable script={script} onChange={setScript} />
      </div>
      <div className="right-rail">
        <TranscribePanel onInsert={insertTranscript} />
        <AccountStylePanel script={script} onRewritten={useRewritten} />
      </div>
    </>
  );
}
