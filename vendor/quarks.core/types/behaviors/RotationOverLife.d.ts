import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, ValueGenerator } from '../functions/ValueGenerator';
export declare class RotationOverLife implements Behavior {
    angularVelocity: ValueGenerator | FunctionValueGenerator;
    type: string;
    constructor(angularVelocity: ValueGenerator | FunctionValueGenerator);
    initialize(particle: Particle): void;
    update(particle: Particle, delta: number): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
