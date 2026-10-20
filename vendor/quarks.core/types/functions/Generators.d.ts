import { FunctionJSON } from "./FunctionJSON";
import { RotationGenerator } from "./RotationGenerator";
import { FunctionValueGenerator, ValueGenerator } from "./ValueGenerator";
import { Vector3Generator } from './Vector3Generator';
export declare function GeneratorFromJSON(json: FunctionJSON): FunctionValueGenerator | ValueGenerator | RotationGenerator | Vector3Generator;
