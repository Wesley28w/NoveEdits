import React, { useState } from 'react';
import { Modal } from '../../components/Modal';
import type { EditPlanDebugInfo } from '@shared/types';

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '10px 12px',
          background: 'var(--surface)',
          border: 'none',
          borderRadius: open ? '8px 8px 0 0' : 8,
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {title}
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}

export function GenerationInfoModal({ debug, onClose }: { debug: EditPlanDebugInfo; onClose: () => void }) {
  return (
    <Modal title="Generation Info" onClose={onClose} width={720}>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 0 }}>
        Generated {new Date(debug.generatedAt).toLocaleString()}
      </p>

      {debug.warnings.length > 0 && (
        <Section title={`⚠ Warnings (${debug.warnings.length})`} defaultOpen>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--danger)' }}>
            {debug.warnings.map((w, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Asset Tags (${debug.assetTags.length})`} defaultOpen={debug.warnings.length === 0}>
        {debug.assetTags.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No assets were tagged.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {debug.assetTags.map((a) => (
            <div key={a.assetId} style={{ fontSize: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <strong>{a.fileName}</strong>
              {a.visualSummary && <p style={{ margin: '4px 0' }}>Visual: {a.visualSummary}</p>}
              {a.visualMoments && a.visualMoments.length > 0 && (
                <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                  Moments: {a.visualMoments.map((m) => `${m.atSec.toFixed(1)}s: ${m.description}`).join(' · ')}
                </p>
              )}
              {a.audioSegments && a.audioSegments.length > 0 ? (
                <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                  Speech: {a.audioSegments.map((s) => `"${s.text}" (${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s)`).join(' / ')}
                </p>
              ) : (
                <p style={{ margin: '4px 0', color: 'var(--muted)' }}>Speech: (none detected)</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title={`Storyboard Passes (${debug.draftHistory.length})`}>
        {debug.draftHistory.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>No storyboard passes recorded.</p>}
        {debug.draftHistory.map((pass, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 4px' }}>
              {pass.label} — mood: {pass.overallMood} — {pass.beats.length} beat{pass.beats.length === 1 ? '' : 's'}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                    <th style={{ padding: '2px 6px' }}>Row</th>
                    <th style={{ padding: '2px 6px' }}>Asset</th>
                    <th style={{ padding: '2px 6px' }}>Track</th>
                    <th style={{ padding: '2px 6px' }}>Trim</th>
                    <th style={{ padding: '2px 6px' }}>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {pass.beats.map((b, bi) => (
                    <tr key={bi} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '2px 6px' }}>{b.scriptRowIndex}</td>
                      <td style={{ padding: '2px 6px' }}>{b.assetFileName}</td>
                      <td style={{ padding: '2px 6px' }}>{b.trackKind}</td>
                      <td style={{ padding: '2px 6px' }}>
                        {b.sourceInSec.toFixed(1)}-{b.sourceOutSec.toFixed(1)}s
                      </td>
                      <td style={{ padding: '2px 6px' }}>
                        {b.isHardCutBefore ? 'hard-cut ' : ''}
                        {b.isHighEnergyBuildup ? 'buildup' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Final Review Pass">
        {!debug.finalReview ? (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>No final review data (skipped or failed — see warnings above).</p>
        ) : (
          <>
            <p style={{ fontSize: 12, fontWeight: 600 }}>Clip trim adjustments ({debug.finalReview.clipAdjustments.length})</p>
            {debug.finalReview.clipAdjustments.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>None proposed.</p>
            ) : (
              <ul style={{ fontSize: 12, paddingLeft: 18 }}>
                {debug.finalReview.clipAdjustments.map((c, i) => (
                  <li key={i}>
                    Clip #{c.index}: new in-point {c.sourceInSec.toFixed(1)}s
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 12, fontWeight: 600 }}>Caption revisions ({debug.finalReview.captionRevisions.length})</p>
            {debug.finalReview.captionRevisions.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>None proposed.</p>
            ) : (
              <ul style={{ fontSize: 12, paddingLeft: 18 }}>
                {debug.finalReview.captionRevisions.map((c, i) => (
                  <li key={i}>
                    Caption #{c.index}: "{c.text}"
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="Music Choice">
        <p style={{ fontSize: 12 }}>{debug.musicChoice ?? '(no music selected — see warnings if unexpected)'}</p>
      </Section>
    </Modal>
  );
}
