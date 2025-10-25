"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";
import { useHeroVisibility } from "../motion/HeroParallax";

// Configuration constants
const WAVE_CONFIG = {
	WAVE1_FREQUENCY: 0.5,
	WAVE1_SPEED: 0.5,
	WAVE1_AMPLITUDE: 0.1,
	WAVE2_FREQUENCY: 0.5,
	WAVE2_SPEED: 0.3,
	WAVE2_AMPLITUDE: 0.1,
} as const;

const LIGHT_CONFIG = {
	INTENSITY: 25,
	Z_POSITION: 2,
	DEFAULT_X_RATIO: 0.18,
	DEFAULT_Y_RATIO: 0.01,
	HUE_MIN: 180,
	HUE_MAX: 270,
	SATURATION_MIN: 60,
	SATURATION_MAX: 100,
	LIGHTNESS: 65,
} as const;

const MATERIAL_CONFIG = {
	BASE_COLOR: "#1a1a1a",
	ROUGHNESS: 0.8,
	METALNESS: 0.2,
	AMBIENT_INTENSITY: 0.95,
	DIFFUSE_INTENSITY: 0.15,
	SPECULAR_INTENSITY: 0.05,
	ATTENUATION_LINEAR: 0.1,
	ATTENUATION_QUADRATIC: 0.05,
} as const;

const TEXT_CONFIG = {
	POSITION: [0, 0.5, 1] as [number, number, number],
	FONT_SIZE: 1.8,
	FONT_SIZE_OUTER: 1.805,
	LAYER_COUNT: 15,
	LAYER_SPACING: 0.05,
	COLOR: "#2c3539",
	METALNESS: 0.85,
	ROUGHNESS: 0.25,
	GLARE_DURATION: 2.0, // Duration of glare animation in seconds
	GLARE_LIGHT_INTENSITY: 80, // Increased light intensity during glare
	GLARE_DELAY: 0.3, // Initial delay before first glare starts
	GLARE_INTERVAL: 5.0, // Interval between glare animations in seconds
	GLARE_START_X: -3, // Starting X position for light sweep
	GLARE_END_X: 3, // Ending X position for light sweep
	GLARE_Y: 0.4, // Y position during sweep
} as const;

const GEOMETRY_CONFIG = {
	PLANE_SIZE_MULTIPLIER: 1.5,
	PLANE_SEGMENTS: 40,
} as const;

// Custom shader for GPU-accelerated wave animation
const waveVertexShader = `
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

const waveFragmentShader = `
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

    // Combine lighting - much more subtle effect
    vec3 ambient = uColor * 0.95;  // Mostly base color
    vec3 diffuse = uColor * diff * uLightColor * attenuation * 0.15;  // Very subtle diffuse
    vec3 specular = uLightColor * spec * attenuation * 0.05 * (1.0 - uRoughness);  // Very subtle specular

    vec3 finalColor = ambient + diffuse + specular;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Helper function to calculate glare properties based on elapsed time
function calculateGlareProperties(
	startTime: number | null,
	currentTime: number,
): { isActive: boolean; lightX: number; lightY: number; intensity: number } {
	if (!startTime) {
		return { isActive: false, lightX: 0, lightY: 0, intensity: 0 };
	}

	const totalElapsed = (currentTime - startTime) / 1000; // Convert to seconds
	const cycleTime = TEXT_CONFIG.GLARE_DURATION + TEXT_CONFIG.GLARE_INTERVAL;

	// Calculate which cycle we're in and time within that cycle
	const timeInCycle = totalElapsed % cycleTime;
	const duration = TEXT_CONFIG.GLARE_DURATION;

	// Check if we're in the active glare portion of the cycle
	if (timeInCycle > duration) {
		return { isActive: false, lightX: 0, lightY: 0, intensity: 0 };
	}

	// Calculate progress (0 to 1) within the glare animation
	const progress = timeInCycle / duration;

	// Smooth ease-in-out for light movement
	const easeProgress = (1 - Math.cos(progress * Math.PI)) / 2;

	// Calculate light position - sweep from left to right across the symbol
	const lightX =
		TEXT_CONFIG.GLARE_START_X +
		easeProgress * (TEXT_CONFIG.GLARE_END_X - TEXT_CONFIG.GLARE_START_X);
	const lightY = TEXT_CONFIG.GLARE_Y;

	// Intensity peaks when light is over the symbol (center)
	const distanceFromCenter = Math.abs(lightX);
	const maxDistance = Math.abs(TEXT_CONFIG.GLARE_START_X);
	const intensityMultiplier = 1 - Math.min(distanceFromCenter / maxDistance, 1);
	const intensity = intensityMultiplier * TEXT_CONFIG.GLARE_LIGHT_INTENSITY;

	return { isActive: true, lightX, lightY, intensity };
}

function LitBackground() {
	const meshRef = useRef<Mesh>(null);
	const lightRef = useRef<PointLight>(null);
	const glareLightRef = useRef<PointLight>(null);
	const textGroupRef = useRef<THREE.Group>(null);
	const { viewport, camera } = useThree();
	const isVisible = useHeroVisibility();
	const [glareStartTime, setGlareStartTime] = useState<number | null>(null);
	const glarePropertiesRef = useRef({ isActive: false, lightX: 0, lightY: 0, intensity: 0 });

	// Start glare animation cycle on mount
	useEffect(() => {
		const timer = setTimeout(() => {
			setGlareStartTime(Date.now());
		}, TEXT_CONFIG.GLARE_DELAY * 1000);
		return () => clearTimeout(timer);
	}, []);

	// Create shader material with uniforms
	const shaderMaterial = useMemo(
		() => ({
			uniforms: {
				uTime: { value: 0 },
				uColor: { value: new THREE.Color(MATERIAL_CONFIG.BASE_COLOR) },
				uRoughness: { value: MATERIAL_CONFIG.ROUGHNESS },
				uMetalness: { value: MATERIAL_CONFIG.METALNESS },
				uLightPosition: {
					value: new THREE.Vector3(0, 0, LIGHT_CONFIG.Z_POSITION),
				},
				uLightColor: { value: new THREE.Color("#ffffff") },
				uLightIntensity: { value: LIGHT_CONFIG.INTENSITY },
			},
			vertexShader: waveVertexShader,
			fragmentShader: waveFragmentShader,
		}),
		[],
	);

	useFrame((state) => {
		// Skip expensive operations when hero is not visible
		if (!isVisible) return;

		// Update glare properties based on animation progress
		const glareProps = calculateGlareProperties(glareStartTime, Date.now());
		glarePropertiesRef.current = glareProps;

		// Mouse-controlled light position (always active)
		const hasMouseMoved = state.mouse.x !== 0 || state.mouse.y !== 0;
		const x = hasMouseMoved
			? state.mouse.x * viewport.width
			: viewport.width * LIGHT_CONFIG.DEFAULT_X_RATIO;
		const y = hasMouseMoved
			? state.mouse.y * viewport.height
			: viewport.height * LIGHT_CONFIG.DEFAULT_Y_RATIO;
		const intensity = LIGHT_CONFIG.INTENSITY;

		// Change color based on position - cooler palette (blue to cyan to purple)
		const hue =
			LIGHT_CONFIG.HUE_MIN +
			((state.mouse.x + 1) / 2) * (LIGHT_CONFIG.HUE_MAX - LIGHT_CONFIG.HUE_MIN);
		const saturation =
			LIGHT_CONFIG.SATURATION_MIN +
			((state.mouse.y + 1) / 2) *
				(LIGHT_CONFIG.SATURATION_MAX - LIGHT_CONFIG.SATURATION_MIN);
		const lightness = LIGHT_CONFIG.LIGHTNESS;

		if (lightRef.current) {
			// Position mouse-controlled light slightly in front of the plane
			lightRef.current.position.set(x, y, LIGHT_CONFIG.Z_POSITION);
			lightRef.current.intensity = intensity;
			lightRef.current.color.setHSL(
				hue / 360,
				saturation / 100,
				lightness / 100,
			);
		}

		// Update glare light (separate from mouse light)
		if (glareLightRef.current) {
			if (glareProps.isActive) {
				glareLightRef.current.position.set(
					glareProps.lightX,
					glareProps.lightY,
					LIGHT_CONFIG.Z_POSITION,
				);
				glareLightRef.current.intensity = glareProps.intensity;
				glareLightRef.current.visible = true;
			} else {
				glareLightRef.current.visible = false;
			}
		}

		// Make the text group face the camera
		if (textGroupRef.current) {
			textGroupRef.current.lookAt(camera.position);
		}

		// Make the plane always face the camera and update shader uniforms
		if (meshRef.current) {
			meshRef.current.lookAt(camera.position);

			// Update shader uniforms (GPU handles the animation and lighting)
			const material = meshRef.current.material as THREE.ShaderMaterial;
			if (material.uniforms) {
				if (material.uniforms.uTime) {
					material.uniforms.uTime.value = state.clock.elapsedTime;
				}
				// Update light position and color in shader
				if (material.uniforms.uLightPosition) {
					material.uniforms.uLightPosition.value.set(
						x,
						y,
						LIGHT_CONFIG.Z_POSITION,
					);
				}
				if (material.uniforms.uLightColor) {
					material.uniforms.uLightColor.value.setHSL(
						hue / 360,
						saturation / 100,
						lightness / 100,
					);
				}
				if (material.uniforms.uLightIntensity) {
					material.uniforms.uLightIntensity.value = intensity;
				}
			}
		}
	});

	return (
		<>
			{/* Background plane that fills the viewport and faces camera */}
			<mesh ref={meshRef} position={[0, 0, 0]}>
				<planeGeometry
					args={[
						viewport.width * GEOMETRY_CONFIG.PLANE_SIZE_MULTIPLIER,
						viewport.height * GEOMETRY_CONFIG.PLANE_SIZE_MULTIPLIER,
						GEOMETRY_CONFIG.PLANE_SEGMENTS,
						GEOMETRY_CONFIG.PLANE_SEGMENTS,
					]}
				/>
				<shaderMaterial
					attach="material"
					uniforms={shaderMaterial.uniforms}
					vertexShader={shaderMaterial.vertexShader}
					fragmentShader={shaderMaterial.fragmentShader}
				/>
			</mesh>

			{/* 3D Text that reacts to light */}
			<group ref={textGroupRef} position={TEXT_CONFIG.POSITION}>
				{/* Outer edge layer - highly metallic */}
				<Text
					position={[0, 0, 0.02]}
					fontSize={TEXT_CONFIG.FONT_SIZE_OUTER}
					color="black"
					anchorX="center"
					anchorY="middle"
					outlineWidth={0.0001}
					outlineColor="#575757"
				>
					⊇
					<meshBasicMaterial color="#000000" />
				</Text>

				{/* Create depth by layering multiple text instances - reduced from 30 to 15 for performance */}
				{Array.from({ length: TEXT_CONFIG.LAYER_COUNT }, (_, i) => (
					<Text
						key={i}
						position={[0, 0, -i * TEXT_CONFIG.LAYER_SPACING]}
						fontSize={TEXT_CONFIG.FONT_SIZE}
						color="#0a0a0a"
						anchorX="center"
						anchorY="middle"
					>
						⊇
						<meshStandardMaterial
							color={TEXT_CONFIG.COLOR}
							metalness={TEXT_CONFIG.METALNESS}
							roughness={TEXT_CONFIG.ROUGHNESS}
							emissive="#000000"
							emissiveIntensity={0}
							envMapIntensity={1.5}
						/>
					</Text>
				))}
			</group>

			{/* Ambient light for base visibility */}
			<ambientLight intensity={1} />

			{/* Static directional lights for consistent highlights */}
			<directionalLight
				position={[10, 10, 5]}
				intensity={1.2}
				color="#ffffff"
			/>
			<directionalLight
				position={[-8, -8, 5]}
				intensity={0.6}
				color="#4488ff"
			/>

			{/* Point light that follows mouse */}
			<pointLight
				ref={lightRef}
				intensity={LIGHT_CONFIG.INTENSITY}
				color="#ffffff"
				distance={50}
				decay={1.2}
			/>

			{/* Separate glare light that sweeps across */}
			<pointLight
				ref={glareLightRef}
				intensity={0}
				color="#ffffff"
				distance={50}
				decay={1.2}
				visible={false}
			/>
		</>
	);
}

interface HeroCanvasProps {
	className?: string;
}

export function HeroCanvas({ className }: HeroCanvasProps) {
	return (
		<div
			className={className}
			style={{
				pointerEvents: "auto",
				willChange: "transform",
				transform: "translateZ(0)",
			}}
		>
			<Canvas
				camera={{ position: [0, 0, 5], fov: 45 }}
				style={{ background: "#0a0a0a" }}
				dpr={[1, 2]} // Limit pixel ratio for better performance
				performance={{ min: 0.5 }} // Allow frame rate to drop if needed
				frameloop="always" // Ensure consistent frame loop
				gl={{
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
				}}
			>
				<Suspense fallback={null}>
					<LitBackground />
				</Suspense>
			</Canvas>
		</div>
	);
}
