import React, { useEffect, useState } from 'react';
import type { EditorProject, RenderQuality, RenderResolutionScale } from '@shared/types';
import { useToast } from '../../lib/ToastContext';

const QUALITY_LABELS: Record<RenderQuality, string> = {
  high: 'High (larger file)',
  medium: 'Medium (recommended)',
  low: 'Data saver',
};

export function RenderPanel({ project }: { project: EditorProject }) {
  const toast = useToast();
  const [burnIn, setBurnIn] = useState(true);
  const [both, setBoth] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>('medium');
  const [resolutionScale, setResolutionScale] = useState<RenderResolutionScale>(1);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.api.projects.onRenderProgress((p) => setProgress(p.message));
  }, []);

  async function pickOutputDir() {
    const dir = await window.api.fs.pickFolder();
    if (dir) setOutputDir(dir);
  }

  async function exportVideo() {
    if (!outputDir || !project.id) return;
    setBusy(true);
    setError(null);
    setOutputs([]);
    try {
      const result = await window.api.projects.render({
        projectId: project.id,
        options: { burnInSubtitles: burnIn, renderBothVersions: both, outputDir, quality, resolutionScale },
      });
      setOutputs(result.outputs);
      toast.success(`Export complete — ${result.outputs.length} file${result.outputs.length === 1 ? '' : 's'} written`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const canvasLabel = project.aspectRatio === '16:9' ? '1920×1080 (16:9)' : '1080×1920 (9:16)';
  const scaledLabel = resolutionScale === 1 ? canvasLabel : `${resolutionScale * 100}% of ${canvasLabel}`;

  return (
    <div className="panel" style={{ padding: 14 }}>
      <p className="panel-title">Export</p>

      <label className="field-label">Aspect Ratio</label>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 10 }}>
        {canvasLabel} — change this from the aspect ratio dropdown above the preview.
      </p>

      <label className="field-label">Quality</label>
      <select className="text-input" value={quality} onChange={(e) => setQuality(e.target.value as RenderQuality)} style={{ marginBottom: 10 }}>
        {(Object.keys(QUALITY_LABELS) as RenderQuality[]).map((q) => (
          <option key={q} value={q}>
            {QUALITY_LABELS[q]}
          </option>
        ))}
      </select>

      <label className="field-label">Resolution</label>
      <select
        className="text-input"
        value={resolutionScale}
        onChange={(e) => setResolutionScale(parseFloat(e.target.value) as RenderResolutionScale)}
        style={{ marginBottom: 4 }}
      >
        <option value={1}>Full (100%)</option>
        <option value={0.75}>75%</option>
        <option value={0.5}>50% (fastest, smallest file)</option>
      </select>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>Output: {scaledLabel}</p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
        <input type="checkbox" checked={burnIn} onChange={(e) => setBurnIn(e.target.checked)} />
        Burn in subtitles
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13 }}>
        <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
        Export both versions (captioned + clean)
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="text-input" readOnly value={outputDir ?? '(choose output folder)'} />
        <button className="btn" onClick={pickOutputDir}>
          Choose…
        </button>
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={exportVideo} disabled={busy || !outputDir || !project.id}>
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {!project.id && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Save the project first to enable exporting.</p>
      )}
      {busy && progress && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          <span className="spinner" style={{ marginRight: 6 }} />
          {progress}
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {outputs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className="panel-title">Output</p>
          {outputs.map((o) => (
            <p key={o} style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {o}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
