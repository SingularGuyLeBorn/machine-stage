import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { IParticleSystem, IEmitter } from '../IParticleSystem';
export declare enum SubParticleEmitMode {
    Death = 0,
    Birth = 1,
    Frame = 2
}
export declare class EmitSubParticleSystem implements Behavior {
    private particleSystem;
    useVelocityAsBasis: boolean;
    subParticleSystem: IEmitter | undefined;
    mode: SubParticleEmitMode;
    emitProbability: number;
    type: string;
    private q_;
    private v_;
    private v2_;
    private subEmissions;
    constructor(particleSystem: IParticleSystem, useVelocityAsBasis: boolean, subParticleSystem: IEmitter | undefined, mode?: SubParticleEmitMode, emitProbability?: number);
    initialize(particle: Particle): void;
    update(particle: Particle, delta: number): void;
    private emit;
    frameUpdate(delta: number): void;
    toJSON(): any;
    static fromJSON(json: any, particleSystem: IParticleSystem): Behavior;
    clone(): Behavior;
    reset(): void;
    private setMatrixFromParticle;
}
