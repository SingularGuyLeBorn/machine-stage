import { IPrefab, IAnimationData } from 'quarks.core';
import { Group, Object3D, AnimationClip, AnimationMixer, AnimationAction } from 'three';
import { ParticleEmitter } from './ParticleEmitter';
interface AnimationData extends IAnimationData {
    startTime: number;
    duration: number;
    target: Object3D;
    type: 'three' | 'ps';
    clip?: AnimationClip;
    mixer?: AnimationMixer;
    action?: AnimationAction;
    loop?: boolean;
}
export declare class QuarksPrefab extends Group implements IPrefab {
    type: string;
    animationData: Array<AnimationData>;
    isPlaying: boolean;
    currentTime: number;
    timeScale: number;
    duration: number;
    private _clock;
    private _mixers;
    private _batchedRenderer?;
    private _tempAnimationJSON;
    constructor();
    private registerBatchedRenderer;
    private getOrCreateMixer;
    addThreeAnimation(target: Object3D, clip: AnimationClip, startTime?: number, duration?: number, loop?: boolean): AnimationData;
    addParticleSystemAnimation(emitter: ParticleEmitter, startTime?: number, duration?: number, loop?: boolean): AnimationData;
    removeAnimation(index: number): void;
    play(): void;
    pause(): void;
    stop(): void;
    update(forceDelta?: number): void;
    setTime(time: number): void;
    getDuration(): number;
    private updateDuration;
    resolveReferences(root: Object3D): void;
    toJSON(): any;
    static fromJSON(json: any): QuarksPrefab;
}
export {};
