import { ValueGenerator } from './ValueGenerator';
import { FunctionJSON } from './FunctionJSON';
import { GeneratorMemory } from './GeneratorMemory';
export declare class ConstantValue implements ValueGenerator {
    value: number;
    type: 'value';
    constructor(value: number);
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory): number;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): ConstantValue;
    clone(): ValueGenerator;
}
