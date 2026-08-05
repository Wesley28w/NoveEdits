import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { AppSettings, BinaryStatus, GeminiApiKeyEntry, ThemeMode } from '@shared/types';
import { GEMINI_MODELS, TEXT_MODEL_CHAIN, AUDIO_MODEL_CHAIN, buildFallbackChain } from '@shared/geminiModels';
import { useToast } from '../lib/ToastContext';

const ACCENT_PRESETS = ['#ff6a00', '#e0313e', '#7c3aed', '#2563eb', '#0ea5a2', '#16a34a', '#db2777'];

const TEXT_SCALE_OPTIONS: { label: string; value: number }[] = [
  { label: 'Small', value: 0.9 },
  { label: 'Medium', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'X-Large', value: 1.3 },
];

export function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<BinaryStatus | null>(null);
  const [ensuring, setEnsuring] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  useEffect(() => {
    window.api.binaries.status().then(setStatus);
  }, []);

  async function save(patch: Partial<AppSettings>) {
    const updated = await window.api.settings.save({ ...settings, ...patch });
    onChange(updated);
    return updated;
  }

  async function ensureYtDlp() {
    setEnsuring(true);
    try {
      await window.api.binaries.ensureYtDlp();
      setStatus(await window.api.binaries.status());
      toast.success('yt-dlp is ready');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download yt-dlp');
    } finally {
      setEnsuring(false);
    }
  }

  async function pickMusicFolder() {
    const folder = await window.api.fs.pickFolder();
    if (!folder) return;
    await save({ musicLibraryPath: folder });
    toast.success('Music library folder set');
  }

  async function selectGeminiModel(model: string) {
    await save({ geminiModel: model });
  }

  async function addGeminiKey() {
    const key = newKeyValue.trim();
    if (!key) return;
    const entry: GeminiApiKeyEntry = {
      id: crypto.randomUUID(),
      label: newKeyLabel.trim() || `Key ${settings.geminiApiKeys.length + 1}`,
      key,
    };
    const activeGeminiKeyId = settings.activeGeminiKeyId ?? entry.id;
    await save({ geminiApiKeys: [...settings.geminiApiKeys, entry], activeGeminiKeyId });
    setNewKeyLabel('');
    setNewKeyValue('');
    toast.success('API key added');
  }

  async function selectGeminiKey(id: string) {
    await save({ activeGeminiKeyId: id });
  }

  async function deleteGeminiKey(id: string) {
    const geminiApiKeys = settings.geminiApiKeys.filter((k) => k.id !== id);
    const activeGeminiKeyId = settings.activeGeminiKeyId === id ? (geminiApiKeys[0]?.id ?? null) : settings.activeGeminiKeyId;
    await save({ geminiApiKeys, activeGeminiKeyId });
  }

  function maskKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
  }

  const textChain = buildFallbackChain(TEXT_MODEL_CHAIN, settings.geminiModel);
  const audioChain = buildFallbackChain(AUDIO_MODEL_CHAIN, settings.geminiModel);

  return (
    <Modal title="Settings" onClose={onClose} width={520}>
      <p className="panel-title">Appearance</p>
      <div style={{ marginBottom: 10 }}>
        <span className="field-label">Theme</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className="btn"
              style={{
                flex: 1,
                textTransform: 'capitalize',
                background: settings.theme === mode ? 'var(--accent-soft)' : undefined,
                borderColor: settings.theme === mode ? 'var(--accent)' : undefined,
                color: settings.theme === mode ? 'var(--accent-hover)' : undefined,
              }}
              onClick={() => save({ theme: mode })}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <span className="field-label">Accent Color</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => save({ accentColor: color })}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: color,
                border: settings.accentColor.toLowerCase() === color ? '2px solid var(--fg)' : '1px solid var(--border)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
          <input
            type="color"
            value={settings.accentColor}
            onChange={(e) => save({ accentColor: e.target.value })}
            title="Custom accent color"
            style={{ width: 30, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
          />
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <span className="field-label">Text Size</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {TEXT_SCALE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="btn"
              style={{
                flex: 1,
                background: settings.textScale === opt.value ? 'var(--accent-soft)' : undefined,
                borderColor: settings.textScale === opt.value ? 'var(--accent)' : undefined,
                color: settings.textScale === opt.value ? 'var(--accent-hover)' : undefined,
              }}
              onClick={() => save({ textScale: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <p className="panel-title">Gemini API Key</p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        Required for AI transcription, script rewrites, and edit plans. Get a free key from{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Google AI Studio
        </a>
        . Add as many as you like (e.g. separate accounts to spread out rate limits) and pick which one is active.
      </p>
      {settings.geminiApiKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {settings.geminiApiKeys.map((k) => (
            <label
              key={k.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: settings.activeGeminiKeyId === k.id ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="gemini-key"
                checked={settings.activeGeminiKeyId === k.id}
                onChange={() => selectGeminiKey(k.id)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{k.label}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{maskKey(k.key)}</span>
              <button
                className="btn"
                title="Delete key"
                onClick={(e) => {
                  e.preventDefault();
                  deleteGeminiKey(k.id);
                }}
                style={{ padding: '2px 8px' }}
              >
                Delete
              </button>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          className="text-input"
          placeholder="Label (optional)"
          value={newKeyLabel}
          onChange={(e) => setNewKeyLabel(e.target.value)}
          style={{ flex: '0 0 40%' }}
        />
        <input
          className="text-input"
          type="password"
          placeholder="Paste API key"
          value={newKeyValue}
          onChange={(e) => setNewKeyValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGeminiKey()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={addGeminiKey} disabled={!newKeyValue.trim()}>
          Add
        </button>
      </div>

      <p className="panel-title">Gemini Model</p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        Your pick is tried first; if it errors (rate limit, capacity, or gets restricted for your
        account) the app automatically falls back through the rest of the list below. Google
        occasionally renames or restricts model IDs — check{' '}
        <a href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer">
          the current model list
        </a>{' '}
        if every model in a chain starts failing.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {GEMINI_MODELS.map((m) => (
          <label
            key={m.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              background: settings?.geminiModel === m.id ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="gemini-model"
              checked={settings?.geminiModel === m.id}
              onChange={() => selectGeminiModel(m.id)}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{m.label}</span>
            <span className="badge badge-ok" style={{ textTransform: 'capitalize' }}>
              {m.tier}
            </span>
            {!m.multimodal && (
              <span className="badge badge-warn" title="Can't be used for link transcription (no audio input)">
                Text only
              </span>
            )}
            {m.preview && (
              <span className="badge badge-warn" title="Preview model — may have stricter rate limits">
                Preview
              </span>
            )}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, fontSize: 11, color: 'var(--muted)' }}>
        <div style={{ flex: 1 }}>
          <strong>Rewrite / edit-plan fallback order:</strong>
          <div>{textChain.join(' → ')}</div>
        </div>
        <div style={{ flex: 1 }}>
          <strong>Transcription fallback order:</strong>
          <div>{audioChain.join(' → ')}</div>
        </div>
      </div>

      <p className="panel-title">External Tools</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>ffmpeg</span>
          <span className={`badge ${status?.ffmpeg ? 'badge-ok' : 'badge-warn'}`}>
            {status?.ffmpeg ? 'Ready' : 'Missing'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>yt-dlp (link transcription)</span>
          {status?.ytDlp ? (
            <span className="badge badge-ok">Ready</span>
          ) : (
            <button className="btn btn-primary" onClick={ensureYtDlp} disabled={ensuring}>
              {ensuring ? 'Downloading…' : 'Download'}
            </button>
          )}
        </div>
      </div>

      <p className="panel-title">Music &amp; SFX Library</p>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        Optional folder of your own royalty-free music/SFX. The AI edit-plan step will suggest tracks
        from here (plus a small bundled starter pack) by filename.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="text-input" readOnly value={settings?.musicLibraryPath ?? '(none set)'} />
        <button className="btn" onClick={pickMusicFolder}>
          Choose…
        </button>
      </div>
    </Modal>
  );
}
