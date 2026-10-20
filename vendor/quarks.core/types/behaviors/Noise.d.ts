import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, ValueGenerator } from '../functions';
export declare class Noise implements Behavior {
    frequency: FunctionValueGenerator | ValueGenerator;
    power: FunctionValueGenerator | ValueGenerator;
    positionAmount: FunctionValueGenerator | ValueGenerator;
    rotationAmount: FunctionValueGenerator | ValueGenerator;
    type: string;
    duration: number;
    constructor(frequency: FunctionValueGenerator | ValueGenerator, power: FunctionValueGenerator | ValueGenerator, positionAmount?: FunctionValueGenerator | ValueGenerator, rotationAmount?: FunctionValueGenerator | ValueGenerator);
    initialize(particle: Particle): void;
    update(particle: Particle, _: number): void;
    toJSON(): any;
    frameUpdate(delta: number): void;
    static fromJSON(json: any): Behavior;
    clone(): Behavior;
    reset(): void;
}
