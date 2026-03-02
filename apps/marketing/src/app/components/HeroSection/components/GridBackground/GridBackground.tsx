"use client";

import { motion } from "framer-motion";

export function GridBackground() {
	return (
		<motion.div
			className="absolute inset-0 pointer-events-none z-0"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.8, ease: "easeOut" }}
			aria-hidden="true"
		>
			<svg
				className="absolute inset-0 w-full h-full"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>grid</title>
				<defs>
					<pattern
						id="hero-grid"
						width="60"
						height="60"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 60 0 L 0 0 0 60"
							fill="none"
							stroke="rgba(255,255,255,0.06)"
							strokeWidth="1"
						/>
					</pattern>
					<radialGradient id="grid-fade" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stopColor="white" stopOpacity="1" />
						<stop offset="75%" stopColor="white" stopOpacity="0.95" />
						<stop offset="85%" stopColor="white" stopOpacity="0.7" />
						<stop offset="92%" stopColor="white" stopOpacity="0.3" />
						<stop offset="96%" stopColor="white" stopOpacity="0.1" />
						<stop offset="100%" stopColor="white" stopOpacity="0" />
					</radialGradient>
					<mask id="grid-mask">
						<rect width="100%" height="100%" fill="url(#grid-fade)" />
					</mask>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill="url(#hero-grid)"
					mask="url(#grid-mask)"
				/>
			</svg>
		</motion.div>
	);
}
