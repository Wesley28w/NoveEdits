import React, { createContext, useCallback, useContext, useRef } from 'react';

export interface AudioMixerApi {
  ensureResumed: () => void;
  registerElement: (el: HTMLMediaElement, volumePct: number, muted: boolean) => void;
  updateVolume: (el: HTMLMediaElement, volumePct: number, muted: boolean) => void;
}

const AudioMixerContext = createContext<AudioMixerApi | null>(null);

export function useAudioMixer(): AudioMixerApi {
  const ctx = useContext(AudioMixerContext);
  if (!ctx) throw new Error('useAudioMixer must be used within AudioMixerProvider');
  return ctx;
}

export function AudioMixerProvider({ children }: { children: React.ReactNode }) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef(new WeakMap<HTMLMediaElement, { gain: GainNode }>());

  function getContext(): AudioContext {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  // Must be called from inside a real user-gesture handler (the Play button) — browsers
  // leave a freshly-created AudioContext 'suspended' otherwise.
  const ensureResumed = useCallback(() => {
    const ctx = getContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }, []);

  const registerElement = useCallback((el: HTMLMediaElement, volumePct: number, muted: boolean) => {
    if (nodesRef.current.has(el)) return;
    const ctx = getContext();
    // createMediaElementSource can only be called once per element instance — safe here
    // because each mount of a <video>/<audio> in ClipLayer is a fresh element instance.
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = muted ? 0 : volumePct / 100;
    source.connect(gain).connect(ctx.destination);
    nodesRef.current.set(el, { gain });
  }, []);

  const updateVolume = useCallback((el: HTMLMediaElement, volumePct: number, muted: boolean) => {
    const entry = nodesRef.current.get(el);
    if (entry) entry.gain.gain.value = muted ? 0 : volumePct / 100;
  }, []);

  const api: AudioMixerApi = { ensureResumed, registerElement, updateVolume };
  return <AudioMixerContext.Provider value={api}>{children}</AudioMixerContext.Provider>;
}
