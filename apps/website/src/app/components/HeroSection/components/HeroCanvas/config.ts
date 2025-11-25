export const WAVE_CONFIG = {
	WAVE1_FREQUENCY: 0.5,
	WAVE1_SPEED: 0.5,
	WAVE1_AMPLITUDE: 0.1,
	WAVE2_FREQUENCY: 0.5,
	WAVE2_SPEED: 0.3,
	WAVE2_AMPLITUDE: 0.1,
} as const;

export const LIGHT_CONFIG = {
	INTENSITY: 22, // Reduced from 28 for better performance
	Z_POSITION: 2,
	DEFAULT_X_RATIO: 0.18,
	DEFAULT_Y_RATIO: 0.01,
	HUE_MIN: 180,
	HUE_MAX: 270,
	SATURATION_MIN: 60,
	SATURATION_MAX: 100,
	LIGHTNESS: 65,
} as const;

export const MATERIAL_CONFIG = {
	BASE_COLOR: "#1a1a1a",
	ROUGHNESS: 0.8,
	METALNESS: 0.2,
	AMBIENT_INTENSITY: 0.85,
	DIFFUSE_INTENSITY: 0.3,
	SPECULAR_INTENSITY: 0.1,
	ATTENUATION_LINEAR: 0.1,
	ATTENUATION_QUADRATIC: 0.05,
} as const;

export const TEXT_CONFIG = {
	POSITION: [0, 0.5, 1] as [number, number, number],
	FONT_SIZE: 1.8,
	FONT_SIZE_OUTER: 1.805,
	LAYER_COUNT: 10, // Reduced from 15 for better performance
	LAYER_SPACING: 0.05,
	COLOR: "#2c3539",
	METALNESS: 0.85,
	ROUGHNESS: 0.25,
	GLARE_DURATION: 2.0, // Duration of glare animation in seconds
	GLARE_LIGHT_INTENSITY: 60, // Reduced from 80 for better performance
	GLARE_DELAY: 0.3, // Initial delay before first glare starts
	GLARE_INTERVAL: 5.0, // Interval between glare animations in seconds
	GLARE_START_X: -3, // Starting X position for light sweep
	GLARE_END_X: 3, // Ending X position for light sweep
	GLARE_Y: 0.4, // Y position during sweep
} as const;

export const GEOMETRY_CONFIG = {
	PLANE_SIZE_MULTIPLIER: 1.5,
	PLANE_SEGMENTS: 24, // Reduced from 40 for better performance
} as const;
