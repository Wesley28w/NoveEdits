import React, { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import { ScriptCreationTab } from './tabs/ScriptCreation/ScriptCreationTab';
import { EditorTab } from './tabs/Editor/EditorTab';
import { SettingsModal } from './components/SettingsModal';
import { shade, rgba } from './lib/color';

type Tab = 'script' | 'editor';

function applyAccent(hex: string) {
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-hover', shade(hex, -12));
  root.setProperty('--accent-light', shade(hex, 12));
  root.setProperty('--accent-soft', rgba(hex, 0.14));
  root.setProperty('--shadow-accent', `0 6px 16px ${rgba(hex, 0.28)}`);
  root.setProperty('--shadow-accent-hover', `0 8px 22px ${rgba(hex, 0.36)}`);
}

function applyTheme(mode: AppSettings['theme']) {
  const resolved = mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = resolved;
}

function AppLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="26" height="26" rx="7" fill="var(--accent)" />
      <text x="13" y="18" textAnchor="middle" fontSize="14" fontWeight="800" fontFamily="var(--font)" fill="#fff">
        N
      </text>
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('script');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openInEditorScriptId, setOpenInEditorScriptId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    window.api.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    if (settings) applyAccent(settings.accentColor);
  }, [settings?.accentColor]);

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [settings?.theme]);

  useEffect(() => {
    if (settings) window.api.system.setZoom(settings.textScale);
  }, [settings?.textScale]);

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <AppLogo />
          Nova<span>Edits</span>
        </div>
        <div className="tabs">
          <button className={`tab-button ${tab === 'script' ? 'active' : ''}`} onClick={() => setTab('script')}>
            Script Creation
          </button>
          <button className={`tab-button ${tab === 'editor' ? 'active' : ''}`} onClick={() => setTab('editor')}>
            Editor
          </button>
        </div>
        <button className="icon-button" onClick={() => setSettingsOpen(true)}>
          ⚙ Settings
        </button>
      </div>
      <div className="main-area">
        {tab === 'script' && (
          <ScriptCreationTab
            onSendToEditor={(scriptId) => {
              setOpenInEditorScriptId(scriptId);
              setTab('editor');
            }}
          />
        )}
        {tab === 'editor' && (
          <EditorTab
            initialScriptId={openInEditorScriptId}
            onConsumedInitialScript={() => setOpenInEditorScriptId(null)}
          />
        )}
      </div>
      {settingsOpen && settings && (
        <SettingsModal settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
