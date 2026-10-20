import { GeneratorMemory } from './GeneratorMemory';
import { FunctionJSON } from './FunctionJSON';
import { Vector3 } from '../math';
export interface Vector3Generator {
    type: 'vec3function';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, vec: Vector3, t?: number): Vector3;
    toJSON(): FunctionJSON;
    clone(): Vector3Generator;
}
export declare function Vector3GeneratorFromJSON(json: FunctionJSON): Vector3Generator;
