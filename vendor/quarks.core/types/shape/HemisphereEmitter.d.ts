import { EmitterMode, EmitterShape, ShapeJSON } from './EmitterUtil';
import { Particle } from '../Particle';
import { Matrix4 } from '../math';
import { FunctionValueGenerator, GeneratorMemory, ValueGenerator } from '../functions';
import { EmissionState, IParticleSystem } from '../IParticleSystem';
export interface HemisphereEmitterParameters {
    radius?: number;
    arc?: number;
    thickness?: number;
    mode?: EmitterMode;
    spread?: number;
    speed?: ValueGenerator | FunctionValueGenerator;
}
export declare class HemisphereEmitter implements EmitterShape {
    type: string;
    radius: number;
    arc: number;
    thickness: number;
    mode: EmitterMode;
    spread: number;
    speed: ValueGenerator | FunctionValueGenerator;
    memory: GeneratorMemory;
    _m1: Matrix4;
    constructor(parameters?: HemisphereEmitterParameters);
    private currentValue;
    update(system: IParticleSystem, delta: number): void;
    initialize(p: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any): HemisphereEmitter;
    clone(): EmitterShape;
}
