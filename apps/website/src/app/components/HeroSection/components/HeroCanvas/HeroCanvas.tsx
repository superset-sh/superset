"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { useHeroVisibility } from "../HeroParallax";
import { LitBackground } from "./components/LitBackground";

interface HeroCanvasProps {
	className?: string;
}

// Component to pause frameloop when not visible
function FrameloopController() {
	const { setFrameloop } = useThree();
	const isVisible = useHeroVisibility();

	useEffect(() => {
		setFrameloop(isVisible ? "always" : "never");
	}, [isVisible, setFrameloop]);

	return null;
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
				dpr={[1, 1.5]} // Reduced max DPR for better performance
				performance={{ min: 0.5 }} // Allow frame rate to drop if needed
				frameloop="always" // Controlled by FrameloopController based on visibility
				gl={{
					antialias: false, // Disabled for better performance
					alpha: false,
					powerPreference: "high-performance",
					stencil: false, // Disable stencil buffer if not needed
					depth: true,
				}}
			>
				<FrameloopController />
				<Suspense fallback={null}>
					<LitBackground />
				</Suspense>
			</Canvas>
		</div>
	);
}
