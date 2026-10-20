import { EmitterShape, ShapeJSON } from './EmitterUtil';
import { Particle } from '../Particle';
import { IParticleSystem } from '../IParticleSystem';
import { Matrix4 } from '../math';
export declare class PointEmitter implements EmitterShape {
    type: string;
    _m1: Matrix4;
    constructor();
    update(system: IParticleSystem, delta: number): void;
    initialize(p: Particle): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any): PointEmitter;
    clone(): EmitterShape;
}
