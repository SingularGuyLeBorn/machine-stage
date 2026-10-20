import { EmitterMode, EmitterShape, ShapeJSON } from './EmitterUtil';
import { Particle } from '../Particle';
import { FunctionValueGenerator, GeneratorMemory, ValueGenerator } from '../functions';
import { EmissionState, IParticleSystem } from '../IParticleSystem';
export interface ConeEmitterParameters {
    radius?: number;
    arc?: number;
    thickness?: number;
    angle?: number;
    mode?: EmitterMode;
    spread?: number;
    speed?: ValueGenerator | FunctionValueGenerator;
}
export declare class ConeEmitter implements EmitterShape {
    type: string;
    radius: number;
    arc: number;
    thickness: number;
    angle: number;
    mode: EmitterMode;
    spread: number;
    speed: ValueGenerator | FunctionValueGenerator;
    memory: GeneratorMemory;
    private currentValue;
    constructor(parameters?: ConeEmitterParameters);
    update(system: IParticleSystem, delta: number): void;
    initialize(p: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: ShapeJSON): ConeEmitter;
    clone(): EmitterShape;
}
