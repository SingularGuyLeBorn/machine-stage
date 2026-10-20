import { FunctionValueGenerator, ValueGenerator } from './ValueGenerator';
import { GeneratorMemory } from './GeneratorMemory';
import { Vector3 } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { Vector3Generator } from './Vector3Generator';
export declare class Vector3Function implements Vector3Generator {
    x: FunctionValueGenerator | ValueGenerator;
    y: FunctionValueGenerator | ValueGenerator;
    z: FunctionValueGenerator | ValueGenerator;
    type: 'vec3function';
    constructor(x: FunctionValueGenerator | ValueGenerator, y: FunctionValueGenerator | ValueGenerator, z: FunctionValueGenerator | ValueGenerator);
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, vec: Vector3, t?: number): Vector3;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): Vector3Generator;
    clone(): Vector3Generator;
}
