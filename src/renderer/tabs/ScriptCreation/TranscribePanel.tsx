import React, { useEffect, useState } from 'react';
import type { ScriptRow } from '@shared/types';

export function TranscribePanel({
  onInsert,
}: {
  onInsert: (rows: ScriptRow[], sourceUrl: string, title?: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.api.transcribe.onProgress((p) => {
      setProgress(p.message);
      if (p.stage === 'error') setError(p.message);
    });
  }, []);

  async function run() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setProgress('Starting…');
    try {
      const result = await window.api.transcribe.start(url.trim());
      onInsert(result.rows, result.sourceUrl, result.title);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
      <p className="panel-title">Transcribe from IG / YT Link</p>
      <input
        className="text-input"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={run} disabled={busy || !url.trim()}>
        {busy ? 'Transcribing…' : 'Transcribe & Insert as New Script'}
      </button>
      {busy && progress && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          <span className="spinner" style={{ marginRight: 6 }} />
          {progress}
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}
