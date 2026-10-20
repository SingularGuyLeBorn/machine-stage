import { BufferGeometry, Material, Texture } from "three";
export type ThreeMetaData = {
    textures: {
        [uuid: string]: Texture;
    };
    materials: {
        [uuid: string]: Material;
    };
    geometries: {
        [uuid: string]: BufferGeometry;
    };
};
export declare function getMaterialUVChannelName(value: number): string;
