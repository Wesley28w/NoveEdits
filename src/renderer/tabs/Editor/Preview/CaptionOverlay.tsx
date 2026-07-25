import React from 'react';
import type { CaptionCue } from '@shared/types';

export function CaptionOverlay({
  captions,
  currentSec,
  enabled,
  scale,
}: {
  captions: CaptionCue[];
  currentSec: number;
  enabled: boolean;
  /** Rendered container height (px) ÷ CANVAS.height — converts style.fontSizePx (calibrated
   * against the export canvas) into the correct on-screen px size at the preview's actual size. */
  scale: number;
}) {
  if (!enabled) return null;
  const active = captions.filter((c) => c.enabled && currentSec >= c.startSec && currentSec < c.endSec);

  return (
    <>
      {active.map((cue) => {
        const fontSizePx = Math.max(6, cue.style.fontSizePx * scale);
        const outlinePx = Math.max(1, Math.round(scale * 2));
        return (
          <div
            key={cue.id}
            style={{
              position: 'absolute',
              left: `${cue.style.posXPct}%`,
              top: `${cue.style.posYPct}%`,
              transform: 'translate(-50%, -50%)',
              maxWidth: `${cue.style.maxWidthPct}%`,
              fontFamily: cue.style.fontFamily,
              fontSize: `${fontSizePx}px`,
              color: cue.style.color,
              fontWeight: cue.style.bold ? 700 : 400,
              fontStyle: cue.style.italic ? 'italic' : 'normal',
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              textShadow: [
                `-${outlinePx}px -${outlinePx}px 0 ${cue.style.outlineColor}`,
                `${outlinePx}px -${outlinePx}px 0 ${cue.style.outlineColor}`,
                `-${outlinePx}px ${outlinePx}px 0 ${cue.style.outlineColor}`,
                `${outlinePx}px ${outlinePx}px 0 ${cue.style.outlineColor}`,
              ].join(', '),
              zIndex: 1000,
              pointerEvents: 'none',
            }}
          >
            {cue.text}
          </div>
        );
      })}
    </>
  );
}
