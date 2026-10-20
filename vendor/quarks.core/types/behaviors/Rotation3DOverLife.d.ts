import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { RotationGenerator } from '../functions';
export declare class Rotation3DOverLife implements Behavior {
    angularVelocity: RotationGenerator;
    type: string;
    private tempQuat;
    private tempQuat2;
    constructor(angularVelocity: RotationGenerator);
    initialize(particle: Particle): void;
    update(particle: Particle, delta: number): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
