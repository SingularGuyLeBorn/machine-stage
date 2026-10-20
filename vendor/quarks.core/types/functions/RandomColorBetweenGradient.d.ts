import { FunctionColorGenerator } from './ColorGenerator';
import { Vector4 } from '../math';
import { FunctionJSON } from './FunctionJSON';
import { Gradient } from './Gradient';
import { GeneratorMemory } from './GeneratorMemory';
export declare class RandomColorBetweenGradient implements FunctionColorGenerator {
    gradient1: Gradient;
    gradient2: Gradient;
    type: 'function';
    private indexCount;
    constructor(gradient1: Gradient, gradient2: Gradient);
    startGen(memory: GeneratorMemory): void;
    genColor(memory: GeneratorMemory, color: Vector4, t: number): Vector4;
    toJSON(): FunctionJSON;
    static fromJSON(json: FunctionJSON): RandomColorBetweenGradient;
    clone(): RandomColorBetweenGradient;
}
