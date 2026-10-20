import { FunctionValueGenerator, GeneratorMemory, ValueGenerator } from "../functions";
import { EmissionState, IParticleSystem } from "../IParticleSystem";
import { Particle } from "../Particle";
import { EmitterMode, EmitterShape, ShapeJSON } from "./EmitterUtil";
export interface RectangleEmitterParameters {
    width?: number;
    height?: number;
    thickness?: number;
    mode?: EmitterMode;
    spread?: number;
    speed?: ValueGenerator | FunctionValueGenerator;
}
export declare class RectangleEmitter implements EmitterShape {
    type: string;
    width: number;
    height: number;
    thickness: number;
    mode: EmitterMode;
    spread: number;
    speed: ValueGenerator | FunctionValueGenerator;
    memory: GeneratorMemory;
    private currentValue;
    private _m1;
    constructor(parameters?: RectangleEmitterParameters);
    update(system: IParticleSystem, delta: number): void;
    initialize(p: Particle, emissionState: EmissionState): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any): RectangleEmitter;
    clone(): EmitterShape;
}
