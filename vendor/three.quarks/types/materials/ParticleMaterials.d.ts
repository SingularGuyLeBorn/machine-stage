import { MeshPhysicalMaterial, MeshStandardMaterial, MeshStandardMaterialParameters, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
export declare class ParticleMeshStandardMaterial extends MeshStandardMaterial {
    constructor(parameters: MeshStandardMaterialParameters);
    onBeforeCompile(parameters: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void;
}
export declare class ParticleMeshPhysicsMaterial extends MeshPhysicalMaterial {
    constructor(parameters: MeshStandardMaterialParameters);
    onBeforeCompile(parameters: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void;
}
