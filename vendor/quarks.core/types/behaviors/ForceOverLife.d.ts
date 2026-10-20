import { Behavior } from './Behavior';
import { Particle } from '../Particle';
import { FunctionValueGenerator, ValueGenerator } from '../functions';
import { Quaternion, Vector3 } from '../math';
import { IParticleSystem } from '../IParticleSystem';
export declare class ForceOverLife implements Behavior {
    x: FunctionValueGenerator | ValueGenerator;
    y: FunctionValueGenerator | ValueGenerator;
    z: FunctionValueGenerator | ValueGenerator;
    type: string;
    _temp: Vector3;
    ps: IParticleSystem;
    initialize(particle: Particle, particleSystem: IParticleSystem): void;
    constructor(x: FunctionValueGenerator | ValueGenerator, y: FunctionValueGenerator | ValueGenerator, z: FunctionValueGenerator | ValueGenerator);
    update(particle: Particle, delta: number): void;
    toJSON(): any;
    static fromJSON(json: any): Behavior;
    _tempScale: Vector3;
    _tempQ: Quaternion;
    frameUpdate(delta: number): void;
    clone(): Behavior;
    reset(): void;
}
