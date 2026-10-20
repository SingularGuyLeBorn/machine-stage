import { Constructable, ParameterPair } from "../TypeUtil";
import { JsonMetaData } from "../IParticleSystem";
import { EmitterShape, ShapeJSON } from "./EmitterUtil";
export interface EmitterShapePlugin {
    type: string;
    constructor: Constructable<EmitterShape>;
    params: ParameterPair[];
    loadJSON: (json: any, meta: JsonMetaData) => EmitterShape;
}
export declare const EmitterShapes: {
    [key: string]: EmitterShapePlugin;
};
export declare function EmitterFromJSON(json: ShapeJSON, meta: JsonMetaData): EmitterShape;
