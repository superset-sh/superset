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
						width="16"
						height="16"
						patternUnits="userSpaceOnUse"
					>
						<path
							d="M 16 0 L 0 0 0 16"
							fill="none"
							stroke="rgba(139, 101, 66, 0.12)"
							strokeWidth="2"
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
				{/* Pixelated stars - gold (glowstone) */}
				<rect
					x="10%"
					y="8%"
					width="3"
					height="3"
					fill="#FCDC5F"
					opacity="0.6"
					className="mc-twinkle"
				/>
				<rect
					x="25%"
					y="5%"
					width="2"
					height="2"
					fill="#F5E6D0"
					opacity="0.4"
					className="mc-twinkle mc-twinkle-delay-1"
				/>
				<rect
					x="40%"
					y="12%"
					width="3"
					height="3"
					fill="#FCDC5F"
					opacity="0.5"
					className="mc-twinkle mc-twinkle-delay-2"
				/>
				<rect
					x="55%"
					y="3%"
					width="2"
					height="2"
					fill="#F5E6D0"
					opacity="0.3"
					className="mc-twinkle mc-twinkle-delay-3"
				/>
				<rect
					x="70%"
					y="9%"
					width="3"
					height="3"
					fill="#FCDC5F"
					opacity="0.7"
					className="mc-twinkle"
				/>
				<rect
					x="85%"
					y="6%"
					width="2"
					height="2"
					fill="#F5E6D0"
					opacity="0.5"
					className="mc-twinkle mc-twinkle-delay-2"
				/>
				{/* Emerald sparkles */}
				<rect
					x="15%"
					y="18%"
					width="2"
					height="2"
					fill="#17dd62"
					opacity="0.3"
					className="mc-twinkle mc-twinkle-delay-1"
				/>
				<rect
					x="35%"
					y="20%"
					width="2"
					height="2"
					fill="#FCDC5F"
					opacity="0.4"
					className="mc-twinkle mc-twinkle-delay-3"
				/>
				{/* Diamond sparkles */}
				<rect
					x="60%"
					y="15%"
					width="2"
					height="2"
					fill="#4aedd9"
					opacity="0.35"
					className="mc-twinkle mc-twinkle-delay-2"
				/>
				<rect
					x="80%"
					y="22%"
					width="3"
					height="3"
					fill="#FCDC5F"
					opacity="0.3"
					className="mc-twinkle mc-twinkle-delay-1"
				/>
				<rect
					x="5%"
					y="25%"
					width="2"
					height="2"
					fill="#FCDC5F"
					opacity="0.5"
					className="mc-twinkle mc-twinkle-delay-3"
				/>
				<rect
					x="48%"
					y="7%"
					width="2"
					height="2"
					fill="#F5E6D0"
					opacity="0.6"
					className="mc-twinkle"
				/>
				<rect
					x="92%"
					y="14%"
					width="2"
					height="2"
					fill="#4aedd9"
					opacity="0.3"
					className="mc-twinkle mc-twinkle-delay-2"
				/>
				{/* Redstone sparkles */}
				<rect
					x="20%"
					y="28%"
					width="2"
					height="2"
					fill="#c13b3b"
					opacity="0.3"
					className="mc-twinkle mc-twinkle-delay-1"
				/>
				<rect
					x="75%"
					y="2%"
					width="2"
					height="2"
					fill="#F5E6D0"
					opacity="0.5"
					className="mc-twinkle mc-twinkle-delay-3"
				/>
				{/* Extra enchant purple particles */}
				<rect
					x="30%"
					y="10%"
					width="2"
					height="2"
					fill="#a855f7"
					opacity="0.25"
					className="mc-twinkle mc-twinkle-delay-2"
				/>
				<rect
					x="88%"
					y="18%"
					width="2"
					height="2"
					fill="#a855f7"
					opacity="0.2"
					className="mc-twinkle mc-twinkle-delay-1"
				/>
			</svg>
		</motion.div>
	);
}
