import React, { useEffect, useState } from 'react';
import type { MusicLibraryEntry } from '@shared/types';

function formatDuration(sec?: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MusicLibraryPanel() {
  const [entries, setEntries] = useState<MusicLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    window.api.musicLibrary
      .list()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  function handleDragStart(e: React.DragEvent, entry: MusicLibraryEntry) {
    e.dataTransfer.setData('application/x-reeler-music-entry', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }

  const filtered = search.trim()
    ? entries.filter((e) => e.fileName.toLowerCase().includes(search.trim().toLowerCase()))
    : entries;
  const music = filtered.filter((e) => e.kind === 'music');
  const sfx = filtered.filter((e) => e.kind === 'sfx');

  function renderGroup(title: string, items: MusicLibraryEntry[]) {
    return (
      <div style={{ marginBottom: 14 }}>
        <p className="panel-title">{title}</p>
        {items.length === 0 && <p style={{ fontSize: 11, color: 'var(--muted)' }}>None found.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((entry) => (
            <div
              key={entry.filePath}
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              title="Drag onto a Music/SFX track"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 12,
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                cursor: 'grab',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.fileName}</span>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                {entry.source === 'starter' ? 'starter' : ''} {formatDuration(entry.durationSec)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 14 }}>
      <p className="panel-title">Music &amp; SFX Library</p>
      <input
        className="text-input"
        placeholder="Search tracks…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <>
          {renderGroup('Music', music)}
          {renderGroup('Sound Effects', sfx)}
        </>
      )}
      <p style={{ fontSize: 11, color: 'var(--muted)' }}>
        Drag a track onto the Music or SFX lane in the timeline below.
      </p>
    </div>
  );
}
