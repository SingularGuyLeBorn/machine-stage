import { VFXBatch, RenderMode } from './VFXBatch';
import { BufferGeometry, Layers, Material, Object3D, Texture } from 'three';
import { IParticleSystem } from 'quarks.core';
export interface VFXBatchSettings {
    instancingGeometry: BufferGeometry;
    material: Material;
    uTileCount: number;
    vTileCount: number;
    blendTiles: boolean;
    softParticles: boolean;
    softNearFade: number;
    softFarFade: number;
    renderMode: RenderMode;
    renderOrder: number;
    layers: Layers;
}
export declare class BatchedRenderer extends Object3D {
    batches: Array<VFXBatch>;
    systemToBatchIndex: Map<IParticleSystem, number>;
    type: string;
    depthTexture: Texture | null;
    constructor();
    private static equals;
    addSystem(system: IParticleSystem): void;
    deleteSystem(system: IParticleSystem): void;
    setDepthTexture(depthTexture: Texture | null): void;
    updateSystem(system: IParticleSystem): void;
    update(delta: number): void;
}
