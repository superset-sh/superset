"use client";

import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";
import { useHeroVisibility } from "../../../HeroParallax";
import {
	GEOMETRY_CONFIG,
	LIGHT_CONFIG,
	MATERIAL_CONFIG,
	TEXT_CONFIG,
} from "../../config";
import { calculateGlareProperties } from "../../helpers";
import { waveFragmentShader } from "../../shaders/fragment";
import { waveVertexShader } from "../../shaders/vertex";

export function LitBackground() {
	const meshRef = useRef<Mesh>(null);
	const lightRef = useRef<PointLight>(null);
	const glareLightRef = useRef<PointLight>(null);
	const textGroupRef = useRef<THREE.Group>(null);
	const { viewport, camera } = useThree();
	const isVisible = useHeroVisibility();
	const [glareStartTime, setGlareStartTime] = useState<number | null>(null);
	const glarePropertiesRef = useRef({
		isActive: false,
		lightX: 0,
		lightY: 0,
		intensity: 0,
	});

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

		// Normal position for symbol lighting
		const x = hasMouseMoved
			? (state.mouse.x * viewport.width) / 2
			: viewport.width * LIGHT_CONFIG.DEFAULT_X_RATIO;
		const y = hasMouseMoved
			? (state.mouse.y * viewport.height) / 2
			: viewport.height * LIGHT_CONFIG.DEFAULT_Y_RATIO;

		// Exaggerated position for backdrop shader (1.5x multiplier)
		const backdropX = hasMouseMoved
			? state.mouse.x * viewport.width * 1.5
			: viewport.width * LIGHT_CONFIG.DEFAULT_X_RATIO;
		const backdropY = hasMouseMoved
			? state.mouse.y * viewport.height * 1.5
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
				// Update light position in shader with exaggerated position for backdrop
				if (material.uniforms.uLightPosition) {
					material.uniforms.uLightPosition.value.set(
						backdropX,
						backdropY,
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
			<mesh ref={meshRef} position={[0, 0, -0.5]}>
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
