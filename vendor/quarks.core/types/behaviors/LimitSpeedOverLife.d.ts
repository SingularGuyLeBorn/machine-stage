import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator } from '../functions';
export declare class LimitSpeedOverLife implements Behavior {
    speed: FunctionValueGenerator;
    dampen: number;
    type: string;
    initialize(particle: Particle): void;
    constructor(speed: FunctionValueGenerator, dampen: number);
    update(particle: Particle, delta: number): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
