import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface MasterClockApi {
  currentSec: number;
  isPlaying: boolean;
  totalSec: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (sec: number) => void;
  setTotalSec: (sec: number) => void;
}

const MasterClockContext = createContext<MasterClockApi | null>(null);

export function useMasterClock(): MasterClockApi {
  const ctx = useContext(MasterClockContext);
  if (!ctx) throw new Error('useMasterClock must be used within MasterClockProvider');
  return ctx;
}

export function MasterClockProvider({ children }: { children: React.ReactNode }) {
  const [currentSec, setCurrentSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalSec, setTotalSec] = useState(0);

  const currentSecRef = useRef(0);
  const totalSecRef = useRef(0);
  const epochRef = useRef<{ perfStart: number; secStart: number } | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    totalSecRef.current = totalSec;
  }, [totalSec]);

  const tick = useCallback(() => {
    if (!epochRef.current) return;
    const elapsed = (performance.now() - epochRef.current.perfStart) / 1000;
    let next = epochRef.current.secStart + elapsed;
    if (totalSecRef.current > 0 && next >= totalSecRef.current) {
      next = totalSecRef.current;
      currentSecRef.current = next;
      setCurrentSec(next);
      setIsPlaying(false);
      epochRef.current = null;
      return;
    }
    currentSecRef.current = next;
    setCurrentSec(next);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    epochRef.current = { perfStart: performance.now(), secStart: currentSecRef.current };
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    epochRef.current = null;
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(totalSecRef.current || sec, sec));
    currentSecRef.current = clamped;
    setCurrentSec(clamped);
    if (epochRef.current) {
      epochRef.current = { perfStart: performance.now(), secStart: clamped };
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const api: MasterClockApi = { currentSec, isPlaying, totalSec, play, pause, toggle, seek, setTotalSec };

  return <MasterClockContext.Provider value={api}>{children}</MasterClockContext.Provider>;
}
