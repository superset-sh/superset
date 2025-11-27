"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";
import { useHeroVisibility } from "../motion/HeroParallax";

// Configuration constants
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

function LitBackground() {
	const meshRef = useRef<Mesh>(null);
	const lightRef = useRef<PointLight>(null);
	const textGroupRef = useRef<THREE.Group>(null);
	const { viewport, camera } = useThree();
	const isVisible = useHeroVisibility();

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

		// Check if mouse has moved (not at default 0,0)
		const hasMouseMoved = state.mouse.x !== 0 || state.mouse.y !== 0;

		// Convert normalized mouse coords to full viewport range, or use default position
		const x = hasMouseMoved
			? state.mouse.x * viewport.width
			: viewport.width * LIGHT_CONFIG.DEFAULT_X_RATIO;
		const y = hasMouseMoved
			? state.mouse.y * viewport.height
			: viewport.height * LIGHT_CONFIG.DEFAULT_Y_RATIO;

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
			// Position light slightly in front of the plane
			lightRef.current.position.set(x, y, LIGHT_CONFIG.Z_POSITION);
			lightRef.current.color.setHSL(
				hue / 360,
				saturation / 100,
				lightness / 100,
			);
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
						// biome-ignore lint/suspicious/noArrayIndexKey: Static list with fixed order - index is the appropriate key
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
