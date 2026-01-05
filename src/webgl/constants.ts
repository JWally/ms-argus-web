/**
 * WebGL Fingerprinting Constants
 *
 * Configuration for WebGL-based GPU fingerprinting.
 * WebGL parameters expose detailed GPU information that varies by hardware,
 * making it one of the most reliable fingerprinting vectors.
 *
 * NOTE: GPU validation hashes (KNOWN_GPU_BRAND_CAPABILITIES, KNOWN_CAPABILITIES)
 * have been moved server-side. See TODO-server-side-analysis.md for details.
 * The client collects GPU parameters and computes hashes; the server validates
 * them against known legitimate configurations.
 */

/**
 * WebGL parameters to query for fingerprinting.
 *
 * This is a curated subset of all available WebGL parameters, chosen to
 * maximize fingerprinting entropy while keeping performance reasonable.
 * Parameters are sorted alphabetically for consistent hashing.
 *
 * Categories:
 * - Hardware limits (MAX_*): Expose GPU capabilities and driver settings
 * - Stencil/mask values: Often hardware-dependent defaults
 * - Version strings: Browser and driver version info
 * - Shader precision: GPU floating-point capabilities
 *
 * Commented-out parameters were removed to reduce collection time while
 * maintaining sufficient entropy. They can be re-enabled if needed.
 */
export const WEBGL_PARAMS = [
  // Geometry limits - vary by GPU model
  'ALIASED_POINT_SIZE_RANGE',
  'ALIASED_LINE_WIDTH_RANGE',

  // Stencil buffer configuration - often hardware defaults
  'STENCIL_VALUE_MASK',
  'STENCIL_WRITEMASK',
  'STENCIL_BACK_VALUE_MASK',
  'STENCIL_BACK_WRITEMASK',

  // Texture and viewport limits - key GPU identifiers
  'MAX_TEXTURE_SIZE',
  'MAX_VIEWPORT_DIMS',
  'SUBPIXEL_BITS',

  // Shader limits - vary significantly between GPUs
  'MAX_VERTEX_ATTRIBS',
  'MAX_VERTEX_UNIFORM_VECTORS',
  'MAX_VARYING_VECTORS',
  'MAX_COMBINED_TEXTURE_IMAGE_UNITS',
  'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
  'MAX_TEXTURE_IMAGE_UNITS',
  'MAX_FRAGMENT_UNIFORM_VECTORS',

  // Version and vendor info
  'SHADING_LANGUAGE_VERSION',
  'VENDOR',
  'RENDERER',
  'VERSION',

  // Cube map and renderbuffer limits
  'MAX_CUBE_MAP_TEXTURE_SIZE',
  'MAX_RENDERBUFFER_SIZE',

  // WebGL2-specific parameters
  'MAX_3D_TEXTURE_SIZE',
  'MAX_ELEMENTS_VERTICES',
  'MAX_ELEMENTS_INDICES',
  'MAX_TEXTURE_LOD_BIAS',
  'MAX_DRAW_BUFFERS',
  'MAX_FRAGMENT_UNIFORM_COMPONENTS',
  'MAX_VERTEX_UNIFORM_COMPONENTS',
  'MAX_ARRAY_TEXTURE_LAYERS',
  'MAX_PROGRAM_TEXEL_OFFSET',
  'MAX_VARYING_COMPONENTS',
  'MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS',
  'MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS',
  'MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS',
  'MAX_COLOR_ATTACHMENTS',
  'MAX_SAMPLES',
  'MAX_VERTEX_UNIFORM_BLOCKS',
  'MAX_FRAGMENT_UNIFORM_BLOCKS',
  'MAX_COMBINED_UNIFORM_BLOCKS',
  'MAX_UNIFORM_BUFFER_BINDINGS',
  'MAX_UNIFORM_BLOCK_SIZE',
  'MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS',
  'MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS',
  'MAX_VERTEX_OUTPUT_COMPONENTS',
  'MAX_FRAGMENT_INPUT_COMPONENTS',
  'MAX_SERVER_WAIT_TIMEOUT',
  'MAX_ELEMENT_INDEX',
  'MAX_CLIENT_WAIT_TIMEOUT_WEBGL',
] as const;

/**
 * Parameters that legitimately differ between WebGL and WebGL2 contexts.
 *
 * When comparing parameters between WebGL and WebGL2 to detect inconsistencies,
 * these parameters are expected to differ and should be excluded from mismatch
 * detection. Other parameters should be identical between contexts.
 */
export const VERSION_PARAMS: Record<string, boolean> = {
  ALIASED_LINE_WIDTH_RANGE: true,
  SHADING_LANGUAGE_VERSION: true,
  VERSION: true,
};

/**
 * Vertex shader source for WebGL fingerprinting.
 *
 * This simple shader draws a colored triangle using vertex positions
 * and texture coordinates. The exact pixel output varies by GPU driver
 * due to differences in:
 * - Floating-point precision
 * - Rasterization algorithms
 * - Anti-aliasing implementation
 * - Color interpolation
 */
export const VERTEX_SHADER_SOURCE = `
  attribute vec2 attrVertex;
  varying vec2 varyinTexCoordinate;
  uniform vec2 uniformOffset;
  void main(){
    varyinTexCoordinate = attrVertex + uniformOffset;
    gl_Position = vec4(attrVertex, 0, 1);
  }
`;

/**
 * Fragment shader source for WebGL fingerprinting.
 *
 * Uses the interpolated texture coordinate as the RGB color, creating
 * a gradient across the triangle. The mediump precision is intentional
 * to capture precision differences across GPUs.
 */
export const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  varying vec2 varyinTexCoordinate;
  void main() {
    gl_FragColor = vec4(varyinTexCoordinate, 1, 1);
  }
`;

/**
 * Triangle vertices for WebGL drawing.
 *
 * These coordinates create a triangle in normalized device coordinates (-1 to 1).
 * The shape is intentionally asymmetric to better reveal rasterization differences.
 */
export const TRIANGLE_VERTICES = new Float32Array([
  -0.9,
  -0.7,
  0, // bottom-left
  0.8,
  -0.7,
  0, // bottom-right
  0,
  0.5,
  0, // top-center
]);
