import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, IntervalValue, Vector3Generator } from '../functions';
export declare class SizeBySpeed implements Behavior {
    size: FunctionValueGenerator | Vector3Generator;
    speedRange: IntervalValue;
    type: string;
    initialize(particle: Particle): void;
    constructor(size: FunctionValueGenerator | Vector3Generator, speedRange: IntervalValue);
    update(particle: Particle): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
