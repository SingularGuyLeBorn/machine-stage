import { FunctionJSON } from './FunctionJSON';
import { GeneratorMemory } from './GeneratorMemory';
export interface ValueGenerator {
    type: 'value';
    startGen(memory: any): void;
    genValue(memory: any): number;
    toJSON(): FunctionJSON;
    clone(): ValueGenerator;
}
export interface FunctionValueGenerator {
    type: 'function';
    startGen(memory: GeneratorMemory): void;
    genValue(memory: GeneratorMemory, t: number): number;
    toJSON(): FunctionJSON;
    clone(): FunctionValueGenerator;
}
export declare function ValueGeneratorFromJSON(json: FunctionJSON): FunctionValueGenerator | ValueGenerator;
