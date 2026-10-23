export type CoreMode = "orbit" | "triad" | "hierarchy";
export interface CoreSample {
  bodies: { position: [number, number, number]; radius: number; spin: [number, number, number] }[];
  breath: number;
  coreScale: number;
  arc: number;
  target: number;
  source: number;
}
export const CORE_MODES: CoreMode[];
export const CORE_LIMIT: number;
export function coreBreath(time: number, seed: number): number;
export function sampleCore(time: number, seed: number, mode?: CoreMode): CoreSample;
