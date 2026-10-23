export type TransitStage = "core" | "legs" | "chest" | "arms" | "head" | "screen";
export const TRANSIT_DELAY: Record<TransitStage, number>;
export function transitArrival(time: number | null, delay: number): number;
export function sampleTransit(time: number | null, delay: number): number;
export const RED_FEED_DELAY: { core: number; mount: number; tip: number; fire: number };
export function sampleRedTransit(time: number | null, delay?: number): number;
export function redRayPower(time: number | null): number;
export const RED_PACKET_COUNT: number;
export function redGather(time: number | null): number;
export function redPacketPosition(phase: number, time: number | null): number;
export interface BoostClock {
  last: number;
  flowTime: number;
  enabled: boolean;
  events: { at: number; from: number; to: number }[];
}
export function createBoostClock(seconds?: number): BoostClock;
export function boostAt(clock: BoostClock, seconds: number, delay?: number): number;
export function advanceBoostClock(clock: BoostClock, seconds: number, enabled: boolean): number;
