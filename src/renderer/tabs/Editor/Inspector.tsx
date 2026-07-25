import React from 'react';
import type { CaptionCue, EditPlan, MusicCue, TimelineClip, TrackKind } from '@shared/types';
import { defaultClipTransform } from '@shared/types';
import type { SelectedItem } from './Timeline/Timeline';

const FONT_OPTIONS = ['Arial', 'Helvetica', 'Georgia', 'Impact', 'Courier New', 'Verdana'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, display }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; display?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 48, textAlign: 'right' }}>{display ?? value}</span>
    </div>
  );
}

function allowedTracksFor(kind: 'clip' | 'caption' | 'music', tracks: EditPlan['tracks']) {
  const kinds: TrackKind[] = kind === 'clip' ? ['video', 'overlay'] : kind === 'caption' ? ['caption'] : ['music', 'sfx'];
  return tracks.filter((t) => kinds.includes(t.kind));
}

export function Inspector({
  editPlan,
  selected,
  onChange,
}: {
  editPlan: EditPlan;
  selected: SelectedItem;
  onChange: (editPlan: EditPlan) => void;
}) {
  if (!selected) {
    return (
      <div className="panel" style={{ padding: 14 }}>
        <p className="panel-title">Inspector</p>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Select a clip, caption, or audio cue on the timeline to edit it.</p>
      </div>
    );
  }

  if (selected.kind === 'clip') {
    const clip = editPlan.clips.find((c) => c.id === selected.id);
    if (!clip) return null;
    const update = (patch: Partial<TimelineClip>) => onChange({ ...editPlan, clips: editPlan.clips.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)) });
    const updateTransform = (patch: Partial<TimelineClip['transform']>) => update({ transform: { ...clip.transform, ...patch } });
    const tracks = allowedTracksFor('clip', editPlan.tracks);
    const t = clip.transform;

    return (
      <div className="panel" style={{ padding: 14 }}>
        <p className="panel-title">Clip</p>

        <Field label="Track">
          <select className="text-input" value={clip.trackId} onChange={(e) => update({ trackId: e.target.value })}>
            {tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Speed (${clip.speed.toFixed(2)}x)`}>
          <Slider value={clip.speed} min={0.25} max={4} step={0.05} display={`${clip.speed.toFixed(2)}x`} onChange={(v) => update({ speed: v })} />
        </Field>

        <Field label={`Volume (${clip.volumePct}%)`}>
          <Slider value={clip.volumePct} min={0} max={200} step={1} display={`${clip.volumePct}%`} onChange={(v) => update({ volumePct: v })} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 14 }}>
          <input type="checkbox" checked={clip.muted} onChange={(e) => update({ muted: e.target.checked })} />
          Muted
        </label>

        <p className="panel-title">Transform</p>
        <Field label={`Rotation (${t.rotationDeg}°)`}>
          <Slider value={t.rotationDeg} min={-180} max={180} step={1} display={`${t.rotationDeg}°`} onChange={(v) => updateTransform({ rotationDeg: v })} />
        </Field>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[0, 90, 180, 270].map((deg) => (
            <button key={deg} className="btn" style={{ flex: 1, padding: '4px 0', fontSize: 11 }} onClick={() => updateTransform({ rotationDeg: deg })}>
              {deg}°
            </button>
          ))}
        </div>
        <Field label={`Opacity (${t.opacityPct}%)`}>
          <Slider value={t.opacityPct} min={0} max={100} step={1} display={`${t.opacityPct}%`} onChange={(v) => updateTransform({ opacityPct: v })} />
        </Field>
        <Field label={`Scale (${t.scalePct}%)`}>
          <Slider value={t.scalePct} min={5} max={100} step={1} display={`${t.scalePct}%`} onChange={(v) => updateTransform({ scalePct: v })} />
        </Field>
        <Field label="Position X">
          <Slider value={t.posXPct} min={0} max={100} step={1} display={`${t.posXPct}%`} onChange={(v) => updateTransform({ posXPct: v })} />
        </Field>
        <Field label="Position Y">
          <Slider value={t.posYPct} min={0} max={100} step={1} display={`${t.posYPct}%`} onChange={(v) => updateTransform({ posYPct: v })} />
        </Field>

        <p className="panel-title">Crop (source frame region shown)</p>
        {t.cropRect ? (
          <>
            <Field label="Crop X">
              <Slider value={t.cropRect.xPct} min={0} max={90} step={1} display={`${t.cropRect.xPct}%`} onChange={(v) => updateTransform({ cropRect: { ...t.cropRect!, xPct: v } })} />
            </Field>
            <Field label="Crop Y">
              <Slider value={t.cropRect.yPct} min={0} max={90} step={1} display={`${t.cropRect.yPct}%`} onChange={(v) => updateTransform({ cropRect: { ...t.cropRect!, yPct: v } })} />
            </Field>
            <Field label="Crop Width">
              <Slider value={t.cropRect.wPct} min={10} max={100} step={1} display={`${t.cropRect.wPct}%`} onChange={(v) => updateTransform({ cropRect: { ...t.cropRect!, wPct: v } })} />
            </Field>
            <Field label="Crop Height">
              <Slider value={t.cropRect.hPct} min={10} max={100} step={1} display={`${t.cropRect.hPct}%`} onChange={(v) => updateTransform({ cropRect: { ...t.cropRect!, hPct: v } })} />
            </Field>
            <button className="btn" style={{ width: '100%' }} onClick={() => updateTransform({ cropRect: null })}>
              Remove Crop
            </button>
          </>
        ) : (
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => updateTransform({ cropRect: { xPct: 0, yPct: 0, wPct: 100, hPct: 100 } })}>
            + Add Crop
          </button>
        )}

        <button
          className="btn"
          style={{ width: '100%', marginTop: 14 }}
          onClick={() => updateTransform(defaultClipTransform())}
        >
          Reset Transform
        </button>
      </div>
    );
  }

  if (selected.kind === 'caption') {
    const cue = editPlan.captions.find((c) => c.id === selected.id);
    if (!cue) return null;
    const update = (patch: Partial<CaptionCue>) => onChange({ ...editPlan, captions: editPlan.captions.map((c) => (c.id === cue.id ? { ...c, ...patch } : c)) });
    const updateStyle = (patch: Partial<CaptionCue['style']>) => update({ style: { ...cue.style, ...patch } });
    const tracks = allowedTracksFor('caption', editPlan.tracks);
    const s = cue.style;

    return (
      <div className="panel" style={{ padding: 14 }}>
        <p className="panel-title">Caption</p>
        <Field label="Text">
          <textarea className="text-input" rows={3} value={cue.text} onChange={(e) => update({ text: e.target.value })} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12 }}>
          <input type="checkbox" checked={cue.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          Enabled
        </label>
        <Field label="Track">
          <select className="text-input" value={cue.trackId} onChange={(e) => update({ trackId: e.target.value })}>
            {tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
        </Field>

        <p className="panel-title">Style</p>
        <Field label="Font">
          <select className="text-input" value={s.fontFamily} onChange={(e) => updateStyle({ fontFamily: e.target.value })}>
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Size (${s.fontSizePx}px)`}>
          <Slider value={s.fontSizePx} min={24} max={140} step={2} display={`${s.fontSizePx}`} onChange={(v) => updateStyle({ fontSizePx: v })} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Field label="Color">
            <input type="color" value={s.color} onChange={(e) => updateStyle({ color: e.target.value })} style={{ width: '100%', height: 30 }} />
          </Field>
          <Field label="Outline">
            <input type="color" value={s.outlineColor} onChange={(e) => updateStyle({ outlineColor: e.target.value })} style={{ width: '100%', height: 30 }} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={s.bold} onChange={(e) => updateStyle({ bold: e.target.checked })} />
            Bold
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={s.italic} onChange={(e) => updateStyle({ italic: e.target.checked })} />
            Italic
          </label>
        </div>
        <Field label="Position X">
          <Slider value={s.posXPct} min={0} max={100} step={1} display={`${s.posXPct}%`} onChange={(v) => updateStyle({ posXPct: v })} />
        </Field>
        <Field label="Position Y">
          <Slider value={s.posYPct} min={0} max={100} step={1} display={`${s.posYPct}%`} onChange={(v) => updateStyle({ posYPct: v })} />
        </Field>
        <Field label="Max Width">
          <Slider value={s.maxWidthPct} min={20} max={100} step={1} display={`${s.maxWidthPct}%`} onChange={(v) => updateStyle({ maxWidthPct: v })} />
        </Field>
      </div>
    );
  }

  // music / sfx cue
  const cue = editPlan.music.find((m) => m.id === selected.id);
  if (!cue) return null;
  const update = (patch: Partial<MusicCue>) => onChange({ ...editPlan, music: editPlan.music.map((m) => (m.id === cue.id ? { ...m, ...patch } : m)) });
  const tracks = allowedTracksFor('music', editPlan.tracks);

  return (
    <div className="panel" style={{ padding: 14 }}>
      <p className="panel-title">{cue.kind === 'sfx' ? 'Sound Effect' : 'Music'}</p>
      <p style={{ fontSize: 13, fontWeight: 600, marginTop: 0 }}>{cue.fileName}</p>
      <Field label="Track">
        <select className="text-input" value={cue.trackId} onChange={(e) => update({ trackId: e.target.value })}>
          {tracks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`Volume (${cue.gainDb} dB)`}>
        <Slider value={cue.gainDb} min={-40} max={6} step={1} display={`${cue.gainDb}dB`} onChange={(v) => update({ gainDb: v })} />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Fade In (s)">
          <input
            type="number"
            className="text-input"
            min={0}
            step={0.1}
            value={cue.fadeInSec ?? 0}
            onChange={(e) => update({ fadeInSec: parseFloat(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Fade Out (s)">
          <input
            type="number"
            className="text-input"
            min={0}
            step={0.1}
            value={cue.fadeOutSec ?? 0}
            onChange={(e) => update({ fadeOutSec: parseFloat(e.target.value) || 0 })}
          />
        </Field>
      </div>
      {cue.tags && cue.tags.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>Tags: {cue.tags.join(', ')}</p>
      )}
    </div>
  );
}
