declare const _default: "\n#ifdef USE_MAP\n    vec4 texelColor = texture2D( map, vUv);\n    #ifdef TILE_BLEND\n        texelColor = mix( texelColor, texture2D( map, vUvNext ), vUvBlend );\n    #endif\n    diffuseColor *= texelColor;\n#endif\n";
export default _default;
