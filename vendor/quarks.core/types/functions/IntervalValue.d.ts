import { ValueGenerator } from './ValueGenerator';
import { FunctionJSON } from './FunctionJSON';
import { GeneratorMemory } from './GeneratorMemory';
export declare class IntervalValue implements ValueGenerator {
    a: number;
    b: number;
    constructor(a: number, b: number);
    indexCount: number;
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory): number;
    type: 'value';
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): IntervalValue;
    clone(): ValueGenerator;
}
