export const waveVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 pos = position;

    // Create wave effect using sine waves
    float wave1 = sin(pos.x * 0.5 + uTime * 0.5) * 0.1;
    float wave2 = sin(pos.y * 0.5 + uTime * 0.3) * 0.1;
    pos.z += wave1 + wave2;

    // Calculate normal based on wave derivatives for proper lighting
    float dx = cos(pos.x * 0.5 + uTime * 0.5) * 0.05;
    float dy = cos(pos.y * 0.5 + uTime * 0.3) * 0.05;
    vec3 computedNormal = normalize(vec3(-dx, -dy, 1.0));

    vNormal = normalize(normalMatrix * computedNormal);
    vPosition = (modelViewMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
