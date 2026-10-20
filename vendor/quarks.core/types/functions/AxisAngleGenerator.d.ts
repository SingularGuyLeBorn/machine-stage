import { FunctionValueGenerator, ValueGenerator } from './ValueGenerator';
import { Quaternion, Vector3 } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { RotationGenerator } from './RotationGenerator';
import { GeneratorMemory } from './GeneratorMemory';
export declare class AxisAngleGenerator implements RotationGenerator {
    axis: Vector3;
    angle: FunctionValueGenerator | ValueGenerator;
    type: 'rotation';
    constructor(axis: Vector3, angle: FunctionValueGenerator | ValueGenerator);
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t?: number): Quaternion;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): AxisAngleGenerator;
    clone(): RotationGenerator;
}
