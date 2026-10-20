import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, ValueGenerator } from '../functions';
import { Quaternion, Vector3 } from '../math';
export declare class OrbitOverLife implements Behavior {
    orbitSpeed: FunctionValueGenerator | ValueGenerator;
    axis: Vector3;
    type: string;
    rotation: Quaternion;
    temp: Vector3;
    constructor(orbitSpeed: FunctionValueGenerator | ValueGenerator, axis?: Vector3);
    initialize(particle: Particle): void;
    update(particle: Particle, delta: number): void;
    frameUpdate(delta: number): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    clone(): Behavior;
    reset(): void;
}
