import { Vector4 } from '../math';
import { ColorGenerator } from './ColorGenerator';
import { FunctionJSON } from './FunctionJSON';
import { GeneratorMemory } from './GeneratorMemory';
export declare class RandomColor implements ColorGenerator {
    a: Vector4;
    b: Vector4;
    constructor(a: Vector4, b: Vector4);
    startGen(memory: GeneratorMemory): void;
    genColor(memory: GeneratorMemory, color: Vector4): Vector4;
    type: 'value';
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): RandomColor;
    clone(): ColorGenerator;
}
