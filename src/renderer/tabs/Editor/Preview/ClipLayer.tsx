import React, { useEffect, useRef } from 'react';
import type { AssetClip, TimelineClip } from '@shared/types';
import { clipDurationSec } from '@shared/types';
import { useMasterClock } from './useMasterClock';
import { useAudioMixer } from './AudioMixerContext';
import { toFileUrl } from '../../../lib/fileUrl';

const DRIFT_TOLERANCE_SEC = 0.08;

export function ClipLayer({
  clip,
  asset,
  zIndex,
  selected,
  onSelect,
}: {
  clip: TimelineClip;
  asset: AssetClip;
  zIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { currentSec, isPlaying } = useMasterClock();
  const mixer = useAudioMixer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const registeredRef = useRef(false);

  const { transform } = clip;
  const t = transform;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || asset.type !== 'video') return;
    if (clip.muted || asset.hasAudio === false) return;
    if (!registeredRef.current) {
      mixer.registerElement(el, clip.volumePct, clip.muted);
      registeredRef.current = true;
    } else {
      mixer.updateVolume(el, clip.volumePct, clip.muted);
    }
  }, [clip.volumePct, clip.muted, asset.hasAudio, asset.type, mixer]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || asset.type !== 'video') return;
    el.playbackRate = clip.speed;
    const targetMediaTime = clip.sourceInSec + (currentSec - clip.startSec) * clip.speed;
    if (Math.abs(el.currentTime - targetMediaTime) > DRIFT_TOLERANCE_SEC) {
      el.currentTime = Math.max(0, targetMediaTime);
    }
    if (isPlaying) {
      el.play().catch(() => {
        /* autoplay/interrupt races are harmless here — the drift-correction effect retries continuously */
      });
    } else {
      el.pause();
    }
  }, [currentSec, isPlaying, clip.speed, clip.sourceInSec, clip.startSec, asset.type]);

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${t.scalePct}%`,
    height: `${t.scalePct}%`,
    left: `calc(${t.posXPct}% - ${t.scalePct / 2}%)`,
    top: `calc(${t.posYPct}% - ${t.scalePct / 2}%)`,
    zIndex,
    opacity: t.opacityPct / 100,
    transform: t.rotationDeg ? `rotate(${t.rotationDeg}deg)` : undefined,
    overflow: 'hidden',
    outline: selected ? '3px solid var(--accent)' : 'none',
    cursor: 'pointer',
  };

  const crop = t.cropRect;
  const mediaStyle: React.CSSProperties = crop
    ? {
        position: 'absolute',
        width: `${(100 * 100) / crop.wPct}%`,
        height: `${(100 * 100) / crop.hPct}%`,
        left: `${(-100 * crop.xPct) / crop.wPct}%`,
        top: `${(-100 * crop.yPct) / crop.hPct}%`,
        objectFit: 'fill',
      }
    : { width: '100%', height: '100%', objectFit: 'contain' };

  return (
    <div style={boxStyle} onClick={onSelect}>
      {asset.type === 'video' ? (
        <video ref={videoRef} src={toFileUrl(asset.filePath)} style={mediaStyle} muted={clip.muted || asset.hasAudio === false} />
      ) : (
        <img src={toFileUrl(asset.filePath)} style={mediaStyle} />
      )}
    </div>
  );
}
