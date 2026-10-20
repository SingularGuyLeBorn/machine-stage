import { Texture, Object3D, LoadingManager, ObjectLoader, Material, AnimationClip, BufferGeometry } from 'three';
export declare class QuarksLoader extends ObjectLoader {
    constructor(manager?: LoadingManager);
    linkReference(object: Object3D): void;
    parse<T extends Object3D>(json: any, onLoad?: (object: Object3D) => void): T;
    parseObject(data: any, geometries: {
        [uuid: string]: BufferGeometry;
    }, materials: {
        [uuid: string]: Material;
    }, textures: {
        [uuid: string]: Texture;
    }, animations: {
        [uuid: string]: AnimationClip;
    }): Object3D;
}
