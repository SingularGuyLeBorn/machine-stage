import { RotationGenerator } from './RotationGenerator';
import { Euler, Quaternion } from '../math';
import { FunctionValueGenerator, ValueGenerator } from './ValueGenerator';
import { FunctionJSON } from './FunctionJSON';
import { EulerOrder } from '../math';
import { GeneratorMemory } from './GeneratorMemory';
export declare class EulerGenerator implements RotationGenerator {
    angleX: FunctionValueGenerator | ValueGenerator;
    angleY: FunctionValueGenerator | ValueGenerator;
    angleZ: FunctionValueGenerator | ValueGenerator;
    type: 'rotation';
    eular: Euler;
    constructor(angleX: FunctionValueGenerator | ValueGenerator, angleY: FunctionValueGenerator | ValueGenerator, angleZ: FunctionValueGenerator | ValueGenerator, eulerOrder?: EulerOrder);
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, quat: Quaternion, delta: number, t?: number): Quaternion;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): EulerGenerator;
    clone(): RotationGenerator;
}
