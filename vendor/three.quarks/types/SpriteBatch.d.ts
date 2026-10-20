import { InstancedBufferGeometry } from 'three';
import { Vector3, Quaternion, Matrix3 } from 'quarks.core';
import { VFXBatchSettings } from './BatchedRenderer';
import { VFXBatch } from './VFXBatch';
export declare class SpriteBatch extends VFXBatch {
    geometry: InstancedBufferGeometry;
    private offsetBuffer;
    private rotationBuffer;
    private sizeBuffer;
    private colorBuffer;
    private uvTileBuffer;
    private velocityBuffer?;
    constructor(settings: VFXBatchSettings);
    buildExpandableBuffers(): void;
    setupBuffers(): void;
    expandBuffers(target: number): void;
    rebuildMaterial(): void;
    vector_: Vector3;
    vector2_: Vector3;
    vector3_: Vector3;
    quaternion_: Quaternion;
    quaternion2_: Quaternion;
    quaternion3_: Quaternion;
    rotationMat_: Matrix3;
    rotationMat2_: Matrix3;
    update(): void;
    dispose(): void;
}
