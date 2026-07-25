import React, { useEffect, useRef, useState } from 'react';
import type { EditorProject } from '@shared/types';
import { clipEndSec, projectDurationSec } from '@shared/types';
import { canvasForAspectRatio } from '@shared/constants';
import { useMasterClock } from './useMasterClock';
import { useAudioMixer } from './AudioMixerContext';
import { ClipLayer } from './ClipLayer';
import { CaptionOverlay } from './CaptionOverlay';
import { AudioCueLayer } from './AudioCueLayer';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${cs}`;
}

export function PreviewPlayer({
  project,
  selectedClipId,
  onSelectClip,
}: {
  project: EditorProject;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}) {
  const clock = useMasterClock();
  const mixer = useAudioMixer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const canvas = canvasForAspectRatio(project.aspectRatio);

  useEffect(() => {
    const total = projectDurationSec(project.editPlan);
    clock.setTotalSec(total);
  }, [project.editPlan, clock.setTotalSec]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setScale(rect.height / canvas.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas.height]);

  const assetsById = new Map(project.assets.map((a) => [a.id, a]));
  const tracksByOrder = [...project.editPlan.tracks]
    .filter((t) => t.kind === 'video' || t.kind === 'overlay')
    .filter((t) => !t.hidden)
    .sort((a, b) => a.order - b.order);

  const activeClips = tracksByOrder
    .map((track) => {
      const candidates = project.editPlan.clips.filter(
        (c) => c.trackId === track.id && c.startSec <= clock.currentSec && clock.currentSec < clipEndSec(c),
      );
      const clip = candidates[0];
      if (!clip) return null;
      const asset = assetsById.get(clip.assetId);
      if (!asset) return null;
      return { clip, asset, order: track.order };
    })
    .filter((x): x is { clip: (typeof project.editPlan.clips)[number]; asset: NonNullable<ReturnType<typeof assetsById.get>>; order: number } => x !== null);

  const audioTracks = project.editPlan.tracks.filter((t) => (t.kind === 'music' || t.kind === 'sfx') && !t.hidden);
  const activeMusicCues = audioTracks
    .map((track) =>
      project.editPlan.music.find(
        (m) => m.trackId === track.id && m.startSec <= clock.currentSec && clock.currentSec < m.endSec,
      ),
    )
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  function handlePlayPause() {
    mixer.ensureResumed();
    clock.toggle();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      // Let Space activate a focused button/input normally (native behavior already
      // toggles play/pause when the play button itself has focus — don't double-fire).
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      handlePlayPause();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', borderRadius: 8 }}>
        <div
          ref={containerRef}
          onClick={() => onSelectClip(null)}
          style={{
            position: 'relative',
            height: '100%',
            width: 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: `${canvas.width} / ${canvas.height}`,
            background: 'black',
            overflow: 'hidden',
            borderRadius: 4,
          }}
        >
          {activeClips.map(({ clip, asset, order }) => (
            <ClipLayer
              key={clip.id}
              clip={clip}
              asset={asset}
              zIndex={order}
              selected={clip.id === selectedClipId}
              onSelect={() => onSelectClip(clip.id)}
            />
          ))}
          <CaptionOverlay
            captions={project.editPlan.captions}
            currentSec={clock.currentSec}
            enabled={project.editPlan.subtitlesGloballyEnabled}
            scale={scale}
          />
        </div>
        {activeMusicCues.map((cue) => (
          <AudioCueLayer key={cue.id} cue={cue} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px' }}>
        <button className="btn btn-primary" style={{ width: 44 }} onClick={handlePlayPause}>
          {clock.isPlaying ? '⏸' : '▶'}
        </button>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', width: 110 }}>
          {formatTime(clock.currentSec)} / {formatTime(clock.totalSec)}
        </span>
        <input
          type="range"
          min={0}
          max={clock.totalSec || 1}
          step={0.01}
          value={clock.currentSec}
          onChange={(e) => clock.seek(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
      </div>
    </div>
  );
}
