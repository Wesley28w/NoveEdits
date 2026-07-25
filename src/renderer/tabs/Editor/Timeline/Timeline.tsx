import React, { useEffect, useRef, useState } from 'react';
import type { AssetClip, CaptionCue, EditPlan, MusicCue, MusicLibraryEntry, Track, TrackKind, TimelineClip } from '@shared/types';
import { clipDurationSec, defaultClipTransform, defaultOverlayTransform } from '@shared/types';
import { randomUUID } from '../../../lib/uuid';
import { TrackRow } from './TrackRow';
import { ClipBlock } from './ClipBlock';
import { TimeRuler } from './TimeRuler';
import { TimelineToolbar } from './TimelineToolbar';

export type ItemKind = 'clip' | 'caption' | 'music';
export type SelectedItem = { kind: ItemKind; id: string } | null;

const ROW_HEIGHT = 50; // must match TrackRow's lane height

interface ItemVM {
  kind: ItemKind;
  id: string;
  trackId: string;
  startSec: number;
  durationSec: number;
  label: string;
  color: string;
}

function trackColor(kind: TrackKind): string {
  switch (kind) {
    case 'video':
      return '#3a6ea5';
    case 'overlay':
      return '#8a5fd6';
    case 'caption':
      return '#c2542a';
    case 'music':
      return '#2f9e6e';
    case 'sfx':
      return '#b0891f';
  }
}

function allowedTrackKindsFor(kind: ItemKind): TrackKind[] {
  if (kind === 'clip') return ['video', 'overlay'];
  if (kind === 'caption') return ['caption'];
  return ['music', 'sfx'];
}

function itemKey(kind: ItemKind, id: string): string {
  return `${kind}:${id}`;
}

export function Timeline({
  assetsById,
  editPlan,
  selected,
  onSelect,
  onChange,
  currentSec,
  totalSec,
  onSeek,
}: {
  assetsById: Map<string, AssetClip>;
  editPlan: EditPlan;
  selected: SelectedItem;
  onSelect: (sel: SelectedItem) => void;
  onChange: (editPlan: EditPlan) => void;
  currentSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
}) {
  const [pxPerSec, setPxPerSec] = useState(40);
  const [dragPreview, setDragPreview] = useState<{ id: string; kind: ItemKind; deltaSec: number; targetTrackId: string | null } | null>(null);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [lasso, setLasso] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const trackRowRefs = useRef(new Map<string, HTMLDivElement>());
  const tracksWrapperRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<{ kind: ItemKind; data: TimelineClip | CaptionCue | MusicCue } | null>(null);

  const sortedTracks = [...editPlan.tracks].sort((a, b) => b.order - a.order);

  function itemsForTrack(trackId: string): ItemVM[] {
    const vms: ItemVM[] = [];
    const track = editPlan.tracks.find((t) => t.id === trackId);
    if (!track) return vms;
    editPlan.clips
      .filter((c) => c.trackId === trackId)
      .forEach((c) => {
        vms.push({
          kind: 'clip',
          id: c.id,
          trackId,
          startSec: c.startSec,
          durationSec: clipDurationSec(c),
          label: assetsById.get(c.assetId)?.fileName ?? '(missing asset)',
          color: trackColor(track.kind),
        });
      });
    editPlan.captions
      .filter((c) => c.trackId === trackId)
      .forEach((c) => {
        vms.push({ kind: 'caption', id: c.id, trackId, startSec: c.startSec, durationSec: c.endSec - c.startSec, label: c.text, color: trackColor(track.kind) });
      });
    editPlan.music
      .filter((m) => m.trackId === trackId)
      .forEach((m) => {
        vms.push({ kind: 'music', id: m.id, trackId, startSec: m.startSec, durationSec: m.endSec - m.startSec, label: m.fileName, color: trackColor(track.kind) });
      });
    return vms;
  }

  const allItems = editPlan.tracks.flatMap((t) => itemsForTrack(t.id));
  const allItemsById = new Map(allItems.map((i) => [itemKey(i.kind, i.id), i]));

  function hasOverlap(trackId: string, excludeId: string, start: number, duration: number): boolean {
    const end = start + duration;
    return itemsForTrack(trackId).some((i) => i.id !== excludeId && start < i.startSec + i.durationSec && end > i.startSec);
  }

  function hasOverlapExcludingGroup(trackId: string, start: number, duration: number, group: Set<string>): boolean {
    const end = start + duration;
    return itemsForTrack(trackId).some((i) => !group.has(itemKey(i.kind, i.id)) && start < i.startSec + i.durationSec && end > i.startSec);
  }

  function findTrackAtClientY(clientY: number): string | null {
    for (const [tid, el] of trackRowRefs.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return tid;
    }
    return null;
  }

  function withItemPosition(plan: EditPlan, kind: ItemKind, id: string, newTrackId: string, newStartSec: number): EditPlan {
    if (kind === 'clip') {
      return { ...plan, clips: plan.clips.map((c) => (c.id === id ? { ...c, trackId: newTrackId, startSec: newStartSec } : c)) };
    }
    if (kind === 'caption') {
      return {
        ...plan,
        captions: plan.captions.map((c) => {
          if (c.id !== id) return c;
          const dur = c.endSec - c.startSec;
          return { ...c, trackId: newTrackId, startSec: newStartSec, endSec: newStartSec + dur };
        }),
      };
    }
    return {
      ...plan,
      music: plan.music.map((m) => {
        if (m.id !== id) return m;
        const dur = m.endSec - m.startSec;
        return { ...m, trackId: newTrackId, startSec: newStartSec, endSec: newStartSec + dur };
      }),
    };
  }

  function selectSingle(item: SelectedItem) {
    setMultiSelected(new Set());
    onSelect(item);
  }

  function handleDragMove(kind: ItemKind, id: string, clientY: number, deltaSec: number) {
    setDragPreview({ id, kind, deltaSec, targetTrackId: findTrackAtClientY(clientY) });
  }

  function handleDragCommit(kind: ItemKind, id: string, originStart: number, originTrackId: string, clientY: number, deltaSec: number) {
    setDragPreview(null);
    const key = itemKey(kind, id);

    if (multiSelected.size > 1 && multiSelected.has(key)) {
      // Group move: shift every selected item by the same delta, each staying on its own track.
      let valid = true;
      multiSelected.forEach((k) => {
        const item = allItemsById.get(k);
        if (!item) return;
        const newStart = Math.max(0, item.startSec + deltaSec);
        if (hasOverlapExcludingGroup(item.trackId, newStart, item.durationSec, multiSelected)) valid = false;
      });
      if (!valid) return;
      let plan = editPlan;
      multiSelected.forEach((k) => {
        const item = allItemsById.get(k);
        if (!item) return;
        const newStart = Math.max(0, item.startSec + deltaSec);
        plan = withItemPosition(plan, item.kind, item.id, item.trackId, newStart);
      });
      onChange(plan);
      return;
    }

    const targetTrackId = findTrackAtClientY(clientY) ?? originTrackId;
    const targetTrack = editPlan.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack || !allowedTrackKindsFor(kind).includes(targetTrack.kind)) return;
    const newStart = Math.max(0, originStart + deltaSec);
    const item = allItemsById.get(key);
    if (!item) return;
    if (hasOverlap(targetTrackId, id, newStart, item.durationSec)) return;
    onChange(withItemPosition(editPlan, kind, id, targetTrackId, newStart));
  }

  function handleTrimLeft(kind: ItemKind, id: string, newStartSec: number, newDurationSec: number) {
    if (kind === 'clip') {
      onChange({
        ...editPlan,
        clips: editPlan.clips.map((c) => {
          if (c.id !== id) return c;
          const newSourceIn = Math.max(0, c.sourceOutSec - newDurationSec * c.speed);
          return { ...c, startSec: newStartSec, sourceInSec: newSourceIn };
        }),
      });
    } else if (kind === 'caption') {
      onChange({ ...editPlan, captions: editPlan.captions.map((c) => (c.id === id ? { ...c, startSec: newStartSec } : c)) });
    } else {
      onChange({
        ...editPlan,
        music: editPlan.music.map((m) =>
          m.id === id ? { ...m, startSec: newStartSec, sourceInSec: Math.max(0, m.sourceInSec + (newStartSec - m.startSec)) } : m,
        ),
      });
    }
  }

  function handleTrimRight(kind: ItemKind, id: string, newDurationSec: number) {
    if (kind === 'clip') {
      onChange({
        ...editPlan,
        clips: editPlan.clips.map((c) => (c.id === id ? { ...c, sourceOutSec: c.sourceInSec + newDurationSec * c.speed } : c)),
      });
    } else if (kind === 'caption') {
      onChange({ ...editPlan, captions: editPlan.captions.map((c) => (c.id === id ? { ...c, endSec: c.startSec + newDurationSec } : c)) });
    } else {
      onChange({ ...editPlan, music: editPlan.music.map((m) => (m.id === id ? { ...m, endSec: m.startSec + newDurationSec } : m)) });
    }
  }

  function handleSplit() {
    if (!selected || selected.kind !== 'clip') return;
    const clip = editPlan.clips.find((c) => c.id === selected.id);
    if (!clip) return;
    const dur = clipDurationSec(clip);
    if (currentSec <= clip.startSec + 0.02 || currentSec >= clip.startSec + dur - 0.02) return;
    const splitSourceSec = clip.sourceInSec + (currentSec - clip.startSec) * clip.speed;
    const left: TimelineClip = { ...clip, sourceOutSec: splitSourceSec };
    const right: TimelineClip = { ...clip, id: randomUUID(), sourceInSec: splitSourceSec, startSec: currentSec };
    onChange({ ...editPlan, clips: editPlan.clips.map((c) => (c.id === clip.id ? left : c)).concat(right) });
    selectSingle({ kind: 'clip', id: right.id });
  }

  function handleCopy() {
    if (!selected) return;
    if (selected.kind === 'clip') {
      const data = editPlan.clips.find((c) => c.id === selected.id);
      if (data) clipboardRef.current = { kind: 'clip', data };
    } else if (selected.kind === 'caption') {
      const data = editPlan.captions.find((c) => c.id === selected.id);
      if (data) clipboardRef.current = { kind: 'caption', data };
    } else {
      const data = editPlan.music.find((m) => m.id === selected.id);
      if (data) clipboardRef.current = { kind: 'music', data };
    }
  }

  function handlePaste() {
    const cb = clipboardRef.current;
    if (!cb) return;
    if (cb.kind === 'clip') {
      const src = cb.data as TimelineClip;
      const newClip: TimelineClip = { ...src, id: randomUUID(), startSec: currentSec };
      onChange({ ...editPlan, clips: [...editPlan.clips, newClip] });
      selectSingle({ kind: 'clip', id: newClip.id });
    } else if (cb.kind === 'caption') {
      const src = cb.data as CaptionCue;
      const dur = src.endSec - src.startSec;
      const newCue: CaptionCue = { ...src, id: randomUUID(), startSec: currentSec, endSec: currentSec + dur };
      onChange({ ...editPlan, captions: [...editPlan.captions, newCue] });
      selectSingle({ kind: 'caption', id: newCue.id });
    } else {
      const src = cb.data as MusicCue;
      const dur = src.endSec - src.startSec;
      const newCue: MusicCue = { ...src, id: randomUUID(), startSec: currentSec, endSec: currentSec + dur };
      onChange({ ...editPlan, music: [...editPlan.music, newCue] });
      selectSingle({ kind: 'music', id: newCue.id });
    }
  }

  function handleDelete() {
    if (multiSelected.size > 0) {
      onChange({
        ...editPlan,
        clips: editPlan.clips.filter((c) => !multiSelected.has(itemKey('clip', c.id))),
        captions: editPlan.captions.filter((c) => !multiSelected.has(itemKey('caption', c.id))),
        music: editPlan.music.filter((m) => !multiSelected.has(itemKey('music', m.id))),
      });
      setMultiSelected(new Set());
      onSelect(null);
      return;
    }
    if (!selected) return;
    if (selected.kind === 'clip') onChange({ ...editPlan, clips: editPlan.clips.filter((c) => c.id !== selected.id) });
    else if (selected.kind === 'caption') onChange({ ...editPlan, captions: editPlan.captions.filter((c) => c.id !== selected.id) });
    else onChange({ ...editPlan, music: editPlan.music.filter((m) => m.id !== selected.id) });
    onSelect(null);
  }

  function laneStartSec(trackId: string, clientX: number): number {
    const laneEl = trackRowRefs.current.get(trackId);
    const rect = laneEl?.getBoundingClientRect();
    return Math.max(0, rect ? (clientX - rect.left) / pxPerSec : currentSec);
  }

  function handleMusicLibraryDrop(trackId: string, clientX: number, entryJson: string) {
    if (!entryJson) return;
    const track = editPlan.tracks.find((t) => t.id === trackId);
    if (!track || (track.kind !== 'music' && track.kind !== 'sfx')) return;
    let entry: MusicLibraryEntry;
    try {
      entry = JSON.parse(entryJson);
    } catch {
      return;
    }
    const startSec = laneStartSec(trackId, clientX);
    const durationSec = entry.durationSec ?? 3;
    if (hasOverlap(trackId, '', startSec, durationSec)) return;
    const newCue: MusicCue = {
      id: randomUUID(),
      trackId,
      filePath: entry.filePath,
      fileName: entry.fileName,
      startSec,
      endSec: startSec + durationSec,
      sourceInSec: 0,
      gainDb: entry.kind === 'sfx' ? 0 : -12,
      kind: entry.kind,
      tags: entry.tags,
    };
    onChange({ ...editPlan, music: [...editPlan.music, newCue] });
    selectSingle({ kind: 'music', id: newCue.id });
  }

  function handleAssetDrop(trackId: string, clientX: number, assetId: string) {
    if (!assetId) return;
    const track = editPlan.tracks.find((t) => t.id === trackId);
    if (!track || (track.kind !== 'video' && track.kind !== 'overlay')) return;
    const asset = assetsById.get(assetId);
    if (!asset || (asset.type !== 'video' && asset.type !== 'image')) return;
    const startSec = laneStartSec(trackId, clientX);
    const durationSec = asset.type === 'image' ? 3 : Math.max(0.5, asset.durationSec ?? 3);
    if (hasOverlap(trackId, '', startSec, durationSec)) return;
    const newClip: TimelineClip = {
      id: randomUUID(),
      trackId,
      assetId,
      sourceInSec: 0,
      sourceOutSec: durationSec,
      startSec,
      speed: 1,
      volumePct: 100,
      muted: track.kind === 'overlay',
      transform: track.kind === 'overlay' ? defaultOverlayTransform() : defaultClipTransform(),
    };
    onChange({ ...editPlan, clips: [...editPlan.clips, newClip] });
    selectSingle({ kind: 'clip', id: newClip.id });
  }

  function handleExternalDrop(trackId: string, clientX: number, dataTransfer: DataTransfer) {
    const musicJson = dataTransfer.getData('application/x-reeler-music-entry');
    if (musicJson) {
      handleMusicLibraryDrop(trackId, clientX, musicJson);
      return;
    }
    const assetId = dataTransfer.getData('application/x-reeler-asset-id');
    if (assetId) handleAssetDrop(trackId, clientX, assetId);
  }

  function handleAddTrack(kind: TrackKind) {
    const sameKind = editPlan.tracks.filter((t) => t.kind === kind);
    const baseOrder: Record<TrackKind, number> = { caption: 100, overlay: 90, video: 80, music: 20, sfx: 10 };
    const kindName: Record<TrackKind, string> = { video: 'Video', overlay: 'Overlay', caption: 'Captions', music: 'Music', sfx: 'SFX' };
    const maxOrder = sameKind.length ? Math.max(...sameKind.map((t) => t.order)) : baseOrder[kind];
    const newTrack: Track = {
      id: randomUUID(),
      kind,
      name: sameKind.length > 0 ? `${kindName[kind]} ${sameKind.length + 1}` : kindName[kind],
      order: maxOrder + 0.1,
    };
    onChange({ ...editPlan, tracks: [...editPlan.tracks, newTrack] });
  }

  function handleLassoPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const wrapper = tracksWrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    setLasso({ x1: startX, y1: startY, x2: startX, y2: startY });

    function move(ev: PointerEvent) {
      setLasso((prev) => (prev ? { ...prev, x2: ev.clientX - rect.left, y2: ev.clientY - rect.top } : null));
    }
    function up(ev: PointerEvent) {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      finalizeLasso(startX, startY, ev.clientX - rect.left, ev.clientY - rect.top);
      setLasso(null);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  function finalizeLasso(x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    if (right - left < 4 && bottom - top < 4) {
      // Treat as a plain click on empty space, not a drag-select.
      selectSingle(null);
      return;
    }
    // x is relative to the whole row (including the 120px track-label column the lane sits after).
    const t1 = Math.max(0, left - 120) / pxPerSec;
    const t2 = Math.max(0, right - 120) / pxPerSec;
    const rowMin = Math.max(0, Math.floor(top / ROW_HEIGHT));
    const rowMax = Math.min(sortedTracks.length - 1, Math.floor(bottom / ROW_HEIGHT));
    if (rowMax < rowMin) {
      setMultiSelected(new Set());
      onSelect(null);
      return;
    }
    const spannedTrackIds = new Set(sortedTracks.slice(rowMin, rowMax + 1).map((t) => t.id));
    const hits = allItems.filter((i) => spannedTrackIds.has(i.trackId) && i.startSec < t2 && i.startSec + i.durationSec > t1);
    const keys = new Set(hits.map((i) => itemKey(i.kind, i.id)));
    setMultiSelected(keys);
    if (keys.size === 1) {
      const only = hits[0];
      onSelect({ kind: only.kind, id: only.id });
    } else {
      onSelect(null);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') handleCopy();
      else if ((e.ctrlKey || e.metaKey) && e.key === 'v') handlePaste();
      else if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const timelineWidthPx = Math.max(totalSec * pxPerSec, 400);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TimelineToolbar
        pxPerSec={pxPerSec}
        onZoomChange={setPxPerSec}
        onSplit={handleSplit}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        canSplit={selected?.kind === 'clip'}
        canCopy={!!selected}
        canPaste={!!clipboardRef.current}
        canDelete={!!selected || multiSelected.size > 0}
        subtitlesEnabled={editPlan.subtitlesGloballyEnabled}
        onToggleSubtitles={(enabled) => onChange({ ...editPlan, subtitlesGloballyEnabled: enabled })}
        onAddTrack={handleAddTrack}
      />
      {multiSelected.size > 1 && (
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 6px' }}>
          {multiSelected.size} items selected — drag any one to move the group, or press Delete.
        </p>
      )}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <TimeRuler totalSec={totalSec} pxPerSec={pxPerSec} onSeek={onSeek} />
        <div ref={tracksWrapperRef} onPointerDown={handleLassoPointerDown} style={{ position: 'relative' }}>
          {sortedTracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              ref={(el) => {
                if (el) trackRowRefs.current.set(track.id, el);
                else trackRowRefs.current.delete(track.id);
              }}
              widthPx={timelineWidthPx}
              isDropTarget={dragPreview?.targetTrackId === track.id}
              onLaneClick={(clientX) => {
                selectSingle(null);
                const rect = trackRowRefs.current.get(track.id)?.getBoundingClientRect();
                if (rect) onSeek(Math.max(0, (clientX - rect.left) / pxPerSec));
              }}
              onExternalDrop={(clientX, dataTransfer) => handleExternalDrop(track.id, clientX, dataTransfer)}
            >
              {itemsForTrack(track.id).map((item) => {
                const key = itemKey(item.kind, item.id);
                const isGroupDrag =
                  !!dragPreview && multiSelected.size > 1 && multiSelected.has(itemKey(dragPreview.kind, dragPreview.id)) && multiSelected.has(key);
                return (
                  <ClipBlock
                    key={item.id}
                    label={item.label}
                    startSec={item.startSec}
                    durationSec={item.durationSec}
                    pxPerSec={pxPerSec}
                    color={item.color}
                    selected={(selected?.id === item.id && selected.kind === item.kind) || multiSelected.has(key)}
                    onSelect={() => selectSingle({ kind: item.kind, id: item.id })}
                    previewDeltaSec={dragPreview?.id === item.id && dragPreview.kind === item.kind ? dragPreview.deltaSec : isGroupDrag ? dragPreview!.deltaSec : 0}
                    onDragMove={(_cx, cy, deltaSec) => handleDragMove(item.kind, item.id, cy, deltaSec)}
                    onDragCommit={(_cx, cy, deltaSec) => handleDragCommit(item.kind, item.id, item.startSec, track.id, cy, deltaSec)}
                    onTrimLeftCommit={(ns, nd) => handleTrimLeft(item.kind, item.id, ns, nd)}
                    onTrimRightCommit={(nd) => handleTrimRight(item.kind, item.id, nd)}
                  />
                );
              })}
            </TrackRow>
          ))}
          <div
            style={{
              position: 'absolute',
              left: 120 + currentSec * pxPerSec,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--accent)',
              pointerEvents: 'none',
            }}
          />
          {lasso && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(lasso.x1, lasso.x2),
                top: Math.min(lasso.y1, lasso.y2),
                width: Math.abs(lasso.x2 - lasso.x1),
                height: Math.abs(lasso.y2 - lasso.y1),
                background: 'var(--accent-soft)',
                opacity: 0.6,
                border: '1px solid var(--accent)',
                pointerEvents: 'none',
                zIndex: 500,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
