import React, { useEffect, useRef } from 'react';
import type { MusicCue } from '@shared/types';
import { useMasterClock } from './useMasterClock';
import { useAudioMixer } from './AudioMixerContext';
import { toFileUrl } from '../../../lib/fileUrl';

const DRIFT_TOLERANCE_SEC = 0.08;

function dbToVolumePct(db: number): number {
  return Math.pow(10, db / 20) * 100;
}

/** Renders no visible output — just keeps a music/SFX cue's audio in sync with the master
 * clock and routed through the shared Web Audio mixer, mirroring what ClipLayer does for
 * clip audio. Without this, music/SFX cues only ever play at final ffmpeg render time. */
export function AudioCueLayer({ cue }: { cue: MusicCue }) {
  const { currentSec, isPlaying } = useMasterClock();
  const mixer = useAudioMixer();
  const audioRef = useRef<HTMLAudioElement>(null);
  const registeredRef = useRef(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const volumePct = dbToVolumePct(cue.gainDb);
    if (!registeredRef.current) {
      mixer.registerElement(el, volumePct, false);
      registeredRef.current = true;
    } else {
      mixer.updateVolume(el, volumePct, false);
    }
  }, [cue.gainDb, mixer]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const targetMediaTime = cue.sourceInSec + (currentSec - cue.startSec);
    if (Math.abs(el.currentTime - targetMediaTime) > DRIFT_TOLERANCE_SEC) {
      el.currentTime = Math.max(0, targetMediaTime);
    }
    if (isPlaying) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [currentSec, isPlaying, cue.sourceInSec, cue.startSec]);

  return <audio ref={audioRef} src={toFileUrl(cue.filePath)} style={{ display: 'none' }} />;
}
