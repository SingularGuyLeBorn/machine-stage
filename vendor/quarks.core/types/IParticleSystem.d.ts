import { Matrix4, Vector3 } from './math';
import { IParticle } from './Particle';
import { FunctionValueGenerator, ValueGenerator } from './functions';
export interface EmissionState {
    burstIndex: number;
    burstWaveIndex: number;
    burstParticleIndex: number;
    burstParticleCount: number;
    isBursting: boolean;
    time: number;
    waitEmiting: number;
    travelDistance: number;
    previousWorldPos?: Vector3;
}
export interface Resource {
}
export interface JsonMetaData {
    textures: {
        [uuid: string]: Resource;
    };
    geometries: {
        [uuid: string]: Resource;
    };
}
export interface SerializationOptions {
    useUrlForImage?: boolean;
}
export type RendererEmitterSettings = TrailSettings | MeshSettings | BillBoardSettings | StretchedBillBoardSettings;
export interface StretchedBillBoardSettings {
    speedFactor: number;
    lengthFactor: number;
}
export interface BillBoardSettings {
}
export interface TrailSettings {
    startLength: ValueGenerator | FunctionValueGenerator;
    followLocalOrigin: boolean;
}
export interface MeshSettings {
    rotationAxis?: Vector3;
    startRotationX: ValueGenerator | FunctionValueGenerator;
    startRotationY: ValueGenerator | FunctionValueGenerator;
    startRotationZ: ValueGenerator | FunctionValueGenerator;
}
export interface IEmitter {
    system: IParticleSystem;
    uuid: string;
    visible: boolean;
    matrixWorld: any;
}
export type ParticleSystemEventType = "emitEnd" | "destroy" | "particleDied";
export interface ParticleSystemEvent {
    type: ParticleSystemEventType;
    particleSystem: IParticleSystem;
    particle?: IParticle;
}
export interface IParticleSystem {
    autoDestroy: boolean;
    worldSpace: boolean;
    particleNum: number;
    duration: number;
    looping: boolean;
    particles: Array<IParticle>;
    emitter: IEmitter;
    rendererEmitterSettings: RendererEmitterSettings;
    emissionState: EmissionState;
    paused: boolean;
    pause(): void;
    stop(): void;
    play(): void;
    restart(): void;
    endEmit(): void;
    clone(): IParticleSystem;
    toJSON(metaData: any, options: SerializationOptions): any;
    emit(delta: number, subEmissionState: EmissionState, matrix: Matrix4): void;
    addEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    removeEventListener(event: ParticleSystemEventType, callback: (event: ParticleSystemEvent) => void): void;
    removeAllEventListeners(event: ParticleSystemEventType): void;
}
