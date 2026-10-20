import { FunctionColorGenerator } from './ColorGenerator';
import { Vector3, Vector4 } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { ContinuousLinearFunction } from './ContinuousLinearFunction';
import { GeneratorMemory } from './GeneratorMemory';
export declare class Gradient implements FunctionColorGenerator {
    type: 'function';
    color: ContinuousLinearFunction<Vector3>;
    alpha: ContinuousLinearFunction<number>;
    constructor(color?: Array<[Vector3, number]>, alpha?: Array<[number, number]>);
    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): Gradient;
    clone(): FunctionColorGenerator;
    startGen(memory: GeneratorMemory): void;
}
