import { EmitterShape, ShapeJSON } from './EmitterUtil';
import { Particle } from '../Particle';
import { IParticleSystem } from '../IParticleSystem';
export interface GridEmitterParameters {
    width?: number;
    height?: number;
    column?: number;
    row?: number;
}
export declare class GridEmitter implements EmitterShape {
    type: string;
    width: number;
    height: number;
    column: number;
    row: number;
    constructor(parameters?: GridEmitterParameters);
    initialize(p: Particle): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any): GridEmitter;
    clone(): EmitterShape;
    update(system: IParticleSystem, delta: number): void;
}
