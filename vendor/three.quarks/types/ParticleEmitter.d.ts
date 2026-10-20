import { Object3D, Object3DEventMap } from 'three';
import { IParticleSystem, IEmitter, SerializationOptions } from 'quarks.core';
export interface MetaData {
    geometries: {
        [key: string]: any;
    };
    materials: {
        [key: string]: any;
    };
    textures: {
        [key: string]: any;
    };
    images: {
        [key: string]: any;
    };
    shapes: {
        [key: string]: any;
    };
    skeletons: {
        [key: string]: any;
    };
    animations: {
        [key: string]: any;
    };
    nodes: {
        [key: string]: any;
    };
}
export declare class ParticleEmitter<E extends Object3DEventMap = Object3DEventMap> extends Object3D<E> implements IEmitter {
    type: string;
    system: IParticleSystem;
    constructor(system: IParticleSystem);
    clone(): any;
    dispose(): void;
    extractFromCache(cache: any): any[];
    toJSON(meta?: MetaData, options?: SerializationOptions): any;
}
