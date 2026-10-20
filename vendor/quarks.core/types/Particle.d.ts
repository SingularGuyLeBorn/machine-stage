import { Matrix4, Quaternion, Vector3, Vector4 } from './math';
import { EmissionState } from './IParticleSystem';
import { LinkedList } from './util/LinkedList';
import { GeneratorMemory } from './functions';
export interface IParticle {
    position: Vector3;
    velocity: Vector3;
    age: number;
    life: number;
    size: Vector3;
    rotation?: number | Quaternion;
    uvTile: number;
    color: Vector4;
    memory: GeneratorMemory;
    get died(): boolean;
}
export interface Particle extends IParticle {
    speedModifier: number;
    emissionState?: EmissionState;
    parentMatrix?: Matrix4;
    startSpeed: number;
    startColor: Vector4;
    startSize: Vector3;
    reset(): void;
}
export declare class NodeParticle implements IParticle {
    position: Vector3;
    velocity: Vector3;
    age: number;
    life: number;
    size: Vector3;
    angularVelocity?: number | Quaternion;
    rotation: number | Quaternion;
    color: Vector4;
    uvTile: number;
    get died(): boolean;
    reset(): void;
    memory: never[];
}
export declare class SpriteParticle implements Particle {
    parentMatrix?: Matrix4;
    startSpeed: number;
    startColor: Vector4;
    startSize: Vector3;
    position: Vector3;
    velocity: Vector3;
    age: number;
    life: number;
    size: Vector3;
    speedModifier: number;
    angularVelocity?: number | Quaternion;
    rotation: number | Quaternion;
    color: Vector4;
    uvTile: number;
    get died(): boolean;
    reset(): void;
    memory: never[];
}
export declare class RecordState {
    position: Vector3;
    size: number;
    color: Vector4;
    constructor(position: Vector3, size: number, color: Vector4);
}
export declare class TrailParticle implements Particle {
    parentMatrix?: Matrix4;
    startSpeed: number;
    startColor: Vector4;
    startSize: Vector3;
    position: Vector3;
    localPosition?: Vector3;
    velocity: Vector3;
    age: number;
    life: number;
    size: Vector3;
    length: number;
    speedModifier: number;
    color: Vector4;
    previous: LinkedList<RecordState>;
    uvTile: number;
    update(): void;
    get died(): boolean;
    reset(): void;
    memory: never[];
}
