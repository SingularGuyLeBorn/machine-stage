import { Quaternion } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { RotationGenerator } from './RotationGenerator';
import { GeneratorMemory } from './GeneratorMemory';
export declare class RandomQuatGenerator implements RotationGenerator {
    type: 'rotation';
    constructor();
    indexCount: number;
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t: number): Quaternion;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): RotationGenerator;
    clone(): RotationGenerator;
}
