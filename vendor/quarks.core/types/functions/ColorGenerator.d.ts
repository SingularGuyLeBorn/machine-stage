import { Vector4 } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { RandomColor } from './RandomColor';
import { ColorRange } from './ColorRange';
import { Gradient } from './Gradient';
import { RandomColorBetweenGradient } from './RandomColorBetweenGradient';
import { GeneratorMemory } from './GeneratorMemory';
export interface ColorGenerator {
    type: 'value';
    startGen(memory: GeneratorMemory): void;
    genColor(memory: GeneratorMemory, color: Vector4): Vector4;
    toJSON(): FunctionJSON;
    clone(): ColorGenerator;
}
export interface FunctionColorGenerator {
    type: 'function';
    startGen(memory: GeneratorMemory): void;
    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4;
    toJSON(): FunctionJSON;
    clone(): FunctionColorGenerator;
}
export declare class ConstantColor implements ColorGenerator {
    color: Vector4;
    constructor(color: Vector4);
    startGen(memory: GeneratorMemory): void;
    genColor(memoryGenerator: GeneratorMemory, color: Vector4): Vector4;
    type: 'value';
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): ConstantColor;
    clone(): ColorGenerator;
}
export declare function ColorGeneratorFromJSON(json: FunctionJSON): ConstantColor | ColorRange | RandomColor | Gradient | RandomColorBetweenGradient;
