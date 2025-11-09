export const waveFragmentShader = `
  uniform vec3 uColor;
  uniform float uRoughness;
  uniform float uMetalness;
  uniform vec3 uLightPosition;
  uniform vec3 uLightColor;
  uniform float uLightIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    // Calculate light direction and distance
    vec3 lightDir = uLightPosition - vPosition;
    float distance = length(lightDir);
    lightDir = normalize(lightDir);

    // Attenuation (light falloff) - much stronger falloff
    float attenuation = uLightIntensity / (1.0 + 0.1 * distance + 0.05 * distance * distance);

    // Diffuse lighting - very subtle
    float diff = max(dot(vNormal, lightDir), 0.0);

    // Specular lighting - very subtle
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0);

    // Combine lighting - more visible effect
    vec3 ambient = uColor * 0.85;  // Reduced ambient for more contrast
    vec3 diffuse = uColor * diff * uLightColor * attenuation * 0.3;  // More visible diffuse
    vec3 specular = uLightColor * spec * attenuation * 0.1 * (1.0 - uRoughness);  // More visible specular

    vec3 finalColor = ambient + diffuse + specular;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
