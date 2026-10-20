import { Particle } from '../Particle';
import { Constructable, ParameterPair } from '../TypeUtil';
import { IParticleSystem } from '../IParticleSystem';
export interface Behavior {
    type: string;
    initialize(particle: Particle, particleSystem: IParticleSystem): void;
    update(particle: Particle, delta: number): void;
    frameUpdate(delta: number): void;
    toJSON(): any;
    clone(): Behavior;
    reset(): void;
}
export interface BehaviorPlugin {
    type: string;
    constructor: Constructable<Behavior>;
    params: ParameterPair[];
    loadJSON: (json: any, particleSystem: IParticleSystem) => Behavior;
}
export declare const BehaviorTypes: {
    [key: string]: BehaviorPlugin;
};
export declare function BehaviorFromJSON(json: any, particleSystem: IParticleSystem): Behavior | null;
