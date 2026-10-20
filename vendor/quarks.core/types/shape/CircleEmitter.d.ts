import { EmitterMode, EmitterShape, ShapeJSON } from './EmitterUtil';
import { Particle } from '../Particle';
import { FunctionValueGenerator, GeneratorMemory, ValueGenerator } from '../functions';
import { EmissionState, IParticleSystem } from '../IParticleSystem';
export interface CircleEmitterParameters {
    radius?: number;
    arc?: number;
    thickness?: number;
    mode?: EmitterMode;
    spread?: number;
    speed?: ValueGenerator | FunctionValueGenerator;
}
export declare class CircleEmitter implements EmitterShape {
    type: string;
    radius: number;
    arc: number;
    thickness: number;
    mode: EmitterMode;
    spread: number;
    speed: ValueGenerator | FunctionValueGenerator;
    memory: GeneratorMemory;
    private currentValue;
    constructor(parameters?: CircleEmitterParameters);
    update(system: IParticleSystem, delta: number): void;
    initialize(p: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any): CircleEmitter;
    clone(): EmitterShape;
}
