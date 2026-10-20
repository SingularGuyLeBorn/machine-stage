import { Particle } from '../Particle';
import { EmissionState, IParticleSystem } from '../IParticleSystem';
export interface ShapeJSON {
    type: string;
    radius?: number;
    arc?: number;
    thickness?: number;
    donutRadius?: number;
    angle?: number;
    width?: number;
    height?: number;
    column?: number;
    row?: number;
    mesh?: string;
    mode?: number;
    particleSystem?: string;
    spread?: number;
    speed?: any;
}
export declare enum EmitterMode {
    Random = 0,
    Loop = 1,
    PingPong = 2,
    Burst = 3
}
export declare function getValueFromEmitterMode(mode: EmitterMode, currentValue: number, spread: number, emissionState: EmissionState): number;
export interface EmitterShape {
    type: string;
    initialize(particle: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    update(system: IParticleSystem, delta: number): void;
    clone(): EmitterShape;
}
