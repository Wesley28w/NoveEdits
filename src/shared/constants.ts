export const CANVAS = { width: 1080, height: 1920, fps: 30 } as const;

export type AspectRatio = '9:16' | '16:9';

export interface CanvasSize {
  width: number;
  height: number;
  fps: number;
}

export function canvasForAspectRatio(aspectRatio: AspectRatio | undefined): CanvasSize {
  if (aspectRatio === '16:9') return { width: 1920, height: 1080, fps: 30 };
  return { width: 1080, height: 1920, fps: 30 };
}
