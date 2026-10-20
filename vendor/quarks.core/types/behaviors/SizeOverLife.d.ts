import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, Vector3Generator } from '../functions';
export declare class SizeOverLife implements Behavior {
    size: FunctionValueGenerator | Vector3Generator;
    type: string;
    initialize(particle: Particle): void;
    constructor(size: FunctionValueGenerator | Vector3Generator);
    update(particle: Particle): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
