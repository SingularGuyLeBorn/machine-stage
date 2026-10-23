export type TransitStage = "core" | "legs" | "chest" | "arms" | "head" | "screen";
export const TRANSIT_DELAY: Record<TransitStage, number>;
export function transitArrival(time: number | null, delay: number): number;
export function sampleTransit(time: number | null, delay: number): number;
export const RED_FEED_DELAY: { core: number; mount: number; tip: number; fire: number };
export function sampleRedTransit(time: number | null, delay?: number): number;
export function redRayPower(time: number | null): number;
