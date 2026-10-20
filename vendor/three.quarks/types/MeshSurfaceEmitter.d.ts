import { BufferGeometry } from 'three';
import { Particle, EmitterShape, ShapeJSON, JsonMetaData, IParticleSystem, Plugin } from 'quarks.core';
export declare class MeshSurfaceEmitter implements EmitterShape {
    type: string;
    private _triangleIndexToArea;
    private _geometry?;
    get geometry(): BufferGeometry | undefined;
    set geometry(geometry: BufferGeometry | undefined);
    constructor(geometry?: BufferGeometry);
    private _tempA;
    private _tempB;
    private _tempC;
    initialize(p: Particle): void;
    toJSON(): ShapeJSON;
    static fromJSON(json: any, meta: JsonMetaData): MeshSurfaceEmitter;
    clone(): EmitterShape;
    update(system: IParticleSystem, delta: number): void;
}
export declare const MeshSurfaceEmitterPlugin: Plugin;
