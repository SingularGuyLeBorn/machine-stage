export type TransitStage = "core" | "legs" | "chest" | "arms" | "head" | "screen";
export const TRANSIT_DELAY: Record<TransitStage, number>;
export function transitArrival(time: number | null, delay: number): number;
export function sampleTransit(time: number | null, delay: number): number;
