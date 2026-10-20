import { Object3D } from 'three';
import { ParticleEmitter } from './ParticleEmitter';
import { BatchedRenderer } from './BatchedRenderer';
export declare class QuarksUtil {
    static runOnAllParticleEmitters(obj: Object3D, func: (ps: ParticleEmitter) => void): void;
    static addToBatchRenderer(obj: Object3D, batchRenderer: BatchedRenderer): void;
    static play(obj: Object3D): void;
    static stop(obj: Object3D): void;
    static setAutoDestroy(obj: Object3D, value: boolean): void;
    static endEmit(obj: Object3D): void;
    static restart(obj: Object3D): void;
    static pause(obj: Object3D): void;
}
