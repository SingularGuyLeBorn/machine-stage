import { FunctionJSON } from './FunctionJSON';
import { Quaternion } from '../math';
import { GeneratorMemory } from './GeneratorMemory';
export interface RotationGenerator {
    type: 'rotation';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, q: Quaternion, delta: number, t: number): Quaternion;
    toJSON(): FunctionJSON;
    clone(): RotationGenerator;
}
export declare function RotationGeneratorFromJSON(json: FunctionJSON): RotationGenerator;
