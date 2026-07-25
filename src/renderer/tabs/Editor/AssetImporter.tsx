import React, { useState } from 'react';
import type { AssetClip } from '@shared/types';

export function AssetImporter({
  assets,
  onAdd,
  onRemove,
}: {
  assets: AssetClip[];
  onAdd: (assets: AssetClip[]) => void;
  onRemove: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addPaths(paths: string[]) {
    if (paths.length === 0) return;
    setBusy(true);
    try {
      const probed = await window.api.projects.probeAssets(paths);
      onAdd(probed);
    } finally {
      setBusy(false);
    }
  }

  async function pickFiles() {
    const paths = await window.api.fs.pickFiles();
    await addPaths(paths);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const paths = Array.from(e.dataTransfer.files).map((f) => (f as any).path).filter(Boolean);
    addPaths(paths);
  }

  function handleAssetDragStart(e: React.DragEvent, asset: AssetClip) {
    e.dataTransfer.setData('application/x-reeler-asset-id', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
      <p className="panel-title">Asset Files</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          padding: 18,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        Drag & drop video/image/audio files here
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={pickFiles} disabled={busy}>
            {busy ? 'Adding…' : 'Browse Files…'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {assets.map((a) => {
          const placeable = a.type === 'video' || a.type === 'image';
          return (
            <div
              key={a.id}
              draggable={placeable}
              onDragStart={placeable ? (e) => handleAssetDragStart(e, a) : undefined}
              title={placeable ? 'Drag onto a Video/Overlay track' : undefined}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                padding: '4px 6px',
                borderRadius: 4,
                cursor: placeable ? 'grab' : 'default',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.fileName} <span style={{ color: 'var(--muted)' }}>({a.type}{a.durationSec ? `, ${a.durationSec.toFixed(1)}s` : ''})</span>
              </span>
              <button className="btn" style={{ padding: '1px 6px' }} onClick={() => onRemove(a.id)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {assets.some((a) => a.type === 'video' || a.type === 'image') && (
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          Drag a video/image onto a Video or Overlay track in the timeline below.
        </p>
      )}
    </div>
  );
}
