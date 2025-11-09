"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { LitBackground } from "./components/LitBackground";

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
