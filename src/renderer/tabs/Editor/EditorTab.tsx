import React, { useEffect, useRef, useState } from 'react';
import type { AssetClip, EditorProject, EditorProjectSummary, EditPlan, EditPlanProgress, Script } from '@shared/types';
import { blankEditPlan } from '@shared/types';
import { useToast } from '../../lib/ToastContext';
import { ScriptSourcePicker } from './ScriptSourcePicker';
import { AssetImporter } from './AssetImporter';
import { MusicLibraryPanel } from './MusicLibraryPanel';
import { Inspector } from './Inspector';
import { RenderPanel } from './RenderPanel';
import { Timeline, type SelectedItem } from './Timeline/Timeline';
import { PreviewPlayer } from './Preview/PreviewPlayer';
import { MasterClockProvider, useMasterClock } from './Preview/useMasterClock';
import { AudioMixerProvider } from './Preview/AudioMixerContext';
import { GenerationInfoModal } from './GenerationInfoModal';

function blankProject(script: Script): EditorProject {
  const now = new Date().toISOString();
  return {
    id: '',
    title: script.title || 'Untitled Project',
    createdAt: now,
    updatedAt: now,
    scriptId: script.id || undefined,
    scriptSnapshot: script,
    assets: [],
    editPlan: blankEditPlan(),
    aspectRatio: '9:16',
  };
}

const STEP_LABELS: Record<string, string> = {
  'tagging-visual': 'Watching your assets',
  'tagging-audio': 'Listening to your assets',
  planning: 'Storyboarding arrangement',
  critiquing: 'Refining the plan',
  hydrating: 'Building the timeline',
  'placing-audio': 'Selecting music & SFX',
  captioning: 'Generating captions from footage audio',
  'final-review': 'Final quality pass',
  done: 'Done',
  error: 'Error',
};

export function EditorTab({
  initialScriptId,
  onConsumedInitialScript,
}: {
  initialScriptId: string | null;
  onConsumedInitialScript: () => void;
}) {
  const toast = useToast();
  const [project, setProject] = useState<EditorProject | null>(null);
  const [projects, setProjects] = useState<EditorProjectSummary[]>([]);

  useEffect(() => {
    window.api.projects.list().then(setProjects);
  }, []);

  useEffect(() => {
    if (initialScriptId) onConsumedInitialScript();
  }, [initialScriptId]);

  function onScriptChosen(script: Script) {
    setProject(blankProject(script));
  }

  async function loadProject(id: string) {
    const p = await window.api.projects.load(id);
    if (p) setProject(p);
  }

  async function refreshProjectList() {
    setProjects(await window.api.projects.list());
  }

  async function deleteProject(id: string, title: string) {
    if (!confirm(`Delete project "${title}"? This can't be undone.`)) return;
    await window.api.projects.delete(id);
    if (project?.id === id) setProject(null);
    await refreshProjectList();
  }

  async function importProject() {
    try {
      const imported = await window.api.projects.import();
      if (!imported) return;
      setProject(imported);
      await refreshProjectList();
      toast.success(
        imported.missingAssetIds?.length
          ? `Imported "${imported.title}" — ${imported.missingAssetIds.length} asset(s) need relinking`
          : `Imported "${imported.title}"`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project import failed');
    }
  }

  if (!project) {
    return <ScriptSourcePicker initialScriptId={initialScriptId} onChosen={onScriptChosen} />;
  }

  return (
    <>
      <div className="sidebar">
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setProject(null)}>
            + New Project
          </button>
          <button className="btn" title="Import a .novaproject file" onClick={importProject}>
            Import
          </button>
        </div>
        <p className="panel-title">Saved Projects</p>
        {projects.map((p) => (
          <div key={p.id} className={`saved-list-item ${p.id === project.id ? 'active' : ''}`} onClick={() => loadProject(p.id)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
            <button
              className="btn"
              style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={(e) => {
                e.stopPropagation();
                deleteProject(p.id, p.title);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <MasterClockProvider>
        <AudioMixerProvider>
          <EditorWorkspace project={project} setProject={setProject} refreshProjectList={refreshProjectList} />
        </AudioMixerProvider>
      </MasterClockProvider>
    </>
  );
}

function EditorWorkspace({
  project,
  setProject,
  refreshProjectList,
}: {
  project: EditorProject;
  setProject: (p: EditorProject) => void;
  refreshProjectList: () => void;
}) {
  const toast = useToast();
  const clock = useMasterClock();
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<EditPlanProgress | null>(null);
  const historyRef = useRef<EditPlan[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [showGenerationInfo, setShowGenerationInfo] = useState(false);

  useEffect(() => {
    return window.api.gemini.onEditPlanProgress(setGenProgress);
  }, []);

  useEffect(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, [project.id]);

  function updateEditPlan(next: EditPlan) {
    historyRef.current.push(project.editPlan);
    if (historyRef.current.length > 50) historyRef.current.shift();
    setCanUndo(true);
    setProject({ ...project, editPlan: next });
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (prev === undefined) return;
    setCanUndo(historyRef.current.length > 0);
    setProject({ ...project, editPlan: prev });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function saveProject(p: EditorProject, opts?: { silent?: boolean }): Promise<EditorProject> {
    const saved = await window.api.projects.save(p);
    setProject(saved);
    refreshProjectList();
    if (!opts?.silent) toast.success(`Saved "${saved.title}"`);
    return saved;
  }

  function addAssets(newAssets: AssetClip[]) {
    setProject({ ...project, assets: [...project.assets, ...newAssets] });
    toast.show(`Added ${newAssets.length} asset${newAssets.length === 1 ? '' : 's'}`);
  }

  function removeAsset(id: string) {
    setProject({ ...project, assets: project.assets.filter((a) => a.id !== id) });
  }

  async function exportProject() {
    try {
      const result = await window.api.projects.export(project);
      if (!result.canceled && result.filePath) {
        toast.success(`Exported to ${result.filePath}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project export failed');
    }
  }

  async function relinkAsset(assetId: string) {
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    try {
      const relinked = await window.api.projects.relinkAsset(asset);
      if (!relinked) return;
      setProject({
        ...project,
        assets: project.assets.map((a) => (a.id === assetId ? relinked : a)),
        missingAssetIds: project.missingAssetIds?.filter((id) => id !== assetId),
      });
      toast.success(`Relinked "${relinked.fileName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Relink failed');
    }
  }

  async function generatePlan() {
    setGenerating(true);
    setGenProgress(null);
    try {
      const saved = await saveProject(project, { silent: true });
      const updated = await window.api.gemini.editPlan({ projectId: saved.id });
      setProject(updated);
      toast.success('Edit plan generated — review and adjust below');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function rerenderCaptions() {
    if (!confirm('This deletes all existing captions and regenerates them from the actual footage audio. Continue?')) return;
    setGenerating(true);
    setGenProgress(null);
    try {
      const saved = await saveProject(project, { silent: true });
      const updated = await window.api.gemini.regenerateCaptions({ projectId: saved.id });
      setProject(updated);
      toast.success(`Regenerated ${updated.editPlan.captions.length} caption${updated.editPlan.captions.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="content" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
          <input
            className="text-input"
            style={{ fontSize: 18, fontWeight: 700, flex: 1, minWidth: 120 }}
            value={project.title}
            onChange={(e) => setProject({ ...project, title: e.target.value })}
          />
          <button className="btn" onClick={() => saveProject(project)}>
            Save Project
          </button>
          <button className="btn" onClick={exportProject}>
            Export Project
          </button>
          <button className="btn btn-primary" onClick={generatePlan} disabled={generating || project.assets.length === 0}>
            {generating ? 'Generating…' : 'Generate Edit Plan (AI)'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <select
            className="text-input"
            style={{ width: 150 }}
            value={project.aspectRatio ?? '9:16'}
            onChange={(e) => setProject({ ...project, aspectRatio: e.target.value as '9:16' | '16:9' })}
            title="Aspect ratio"
          >
            <option value="9:16">9:16 Vertical</option>
            <option value="16:9">16:9 Landscape</option>
          </select>
          <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button
            className="btn"
            onClick={rerenderCaptions}
            disabled={generating || project.assets.length === 0}
            title="Delete all captions and retranscribe them from the actual footage audio"
          >
            🔄 Rerender Captions
          </button>
          <button
            className="btn"
            onClick={() => setShowGenerationInfo(true)}
            disabled={!project.lastGenerationDebug}
            title="See the AI's asset tags, storyboard passes, and warnings from the last generation"
            style={project.lastGenerationDebug?.warnings.length ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}
          >
            ℹ Generation Info{project.lastGenerationDebug?.warnings.length ? ` (${project.lastGenerationDebug.warnings.length})` : ''}
          </button>
        </div>
        {!!project.missingAssetIds?.length && (
          <div
            style={{
              border: '1px solid var(--danger)',
              borderRadius: 8,
              padding: '8px 12px',
              marginBottom: 10,
              fontSize: 12,
            }}
          >
            <p style={{ margin: '0 0 6px', color: 'var(--danger)', fontWeight: 600 }}>
              {project.missingAssetIds.length} asset{project.missingAssetIds.length === 1 ? '' : 's'} missing on this
              machine — locate the original files to restore playback and rendering.
            </p>
            {project.missingAssetIds.map((id) => {
              const asset = project.assets.find((a) => a.id === id);
              if (!asset) return null;
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.fileName}
                  </span>
                  <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => relinkAsset(id)}>
                    Locate…
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {generating && genProgress && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
            <span className="spinner" style={{ marginRight: 6 }} />
            {STEP_LABELS[genProgress.step] ?? genProgress.step}: {genProgress.message}
            {genProgress.current !== undefined && genProgress.total !== undefined && ` (${genProgress.current}/${genProgress.total})`}
          </p>
        )}

        <div style={{ height: project.aspectRatio === '16:9' ? 300 : 560, marginBottom: 10 }}>
          <PreviewPlayer
            project={project}
            selectedClipId={selected?.kind === 'clip' ? selected.id : null}
            onSelectClip={(id) => setSelected(id ? { kind: 'clip', id } : null)}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Timeline
            assetsById={new Map(project.assets.map((a) => [a.id, a]))}
            editPlan={project.editPlan}
            selected={selected}
            onSelect={setSelected}
            onChange={updateEditPlan}
            currentSec={clock.currentSec}
            totalSec={clock.totalSec}
            onSeek={clock.seek}
          />
        </div>
      </div>
      <div className="right-rail">
        <div style={{ marginBottom: 16 }}>
          <Inspector editPlan={project.editPlan} selected={selected} onChange={updateEditPlan} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <AssetImporter assets={project.assets} onAdd={addAssets} onRemove={removeAsset} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <MusicLibraryPanel />
        </div>
        <RenderPanel project={project} />
      </div>
      {showGenerationInfo && project.lastGenerationDebug && (
        <GenerationInfoModal debug={project.lastGenerationDebug} onClose={() => setShowGenerationInfo(false)} />
      )}
    </>
  );
}
