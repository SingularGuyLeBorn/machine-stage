import { Mesh, BufferGeometry, Material, Layers, Texture } from 'three';
import { VFXBatchSettings } from './BatchedRenderer';
import { IParticleSystem } from 'quarks.core';
export interface StoredBatchSettings {
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
export declare enum RenderMode {
    BillBoard = 0,
    StretchedBillBoard = 1,
    Mesh = 2,
    Trail = 3,
    HorizontalBillBoard = 4,
    VerticalBillBoard = 5
}
export declare abstract class VFXBatch extends Mesh {
    type: string;
    systems: Set<IParticleSystem>;
    settings: StoredBatchSettings;
    protected maxParticles: number;
    protected constructor(settings: VFXBatchSettings);
    addSystem(system: IParticleSystem): void;
    removeSystem(system: IParticleSystem): void;
    applyDepthTexture(depthTexture: Texture | null): void;
    getVisibleSystems(): IParticleSystem[];
    abstract setupBuffers(): void;
    abstract expandBuffers(target: number): void;
    abstract rebuildMaterial(): void;
    abstract update(): void;
    abstract dispose(): void;
}
