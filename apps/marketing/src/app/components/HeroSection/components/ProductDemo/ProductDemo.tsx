"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { DemoVideo } from "./components/DemoVideo";
import { MeshGradient } from "./components/MeshGradient";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(
		DEMO_OPTIONS[0]?.label ?? "",
	);

	return (
		<div className="relative w-full rounded-lg overflow-hidden">
			{/* Animated mesh gradient backgrounds - all rendered, opacity controlled */}
			{DEMO_OPTIONS.map((option) => (
				<motion.div
					key={`gradient-${option.label}`}
					className="absolute inset-0"
					initial={false}
					animate={{ opacity: activeOption === option.label ? 1 : 0 }}
					transition={{ duration: 0.5, ease: "easeInOut" }}
				>
					<MeshGradient
						colors={option.colors}
						className="absolute inset-0 w-full h-full"
					/>
				</motion.div>
			))}

			{/* Content wrapper */}
			<div className="relative flex flex-col gap-4 p-6">
				{/* Video container with border */}
				<div
					className="relative w-full rounded-lg overflow-hidden "
					style={{ aspectRatio: "1728/1080" }}
				>
					{DEMO_OPTIONS.map((option) => (
						<motion.div
							key={option.label}
							className="absolute -inset-px"
							initial={false}
							animate={{ opacity: activeOption === option.label ? 1 : 0 }}
							transition={{ duration: 0.5, ease: "easeInOut" }}
						>
							<DemoVideo
								src={option.videoPath}
								isActive={activeOption === option.label}
							/>
						</motion.div>
					))}
				</div>

				{/* Selector pills */}
				<div className="flex items-center gap-2 overflow-x-auto">
					{DEMO_OPTIONS.map((option) => (
						<SelectorPill
							key={option.label}
							label={option.label}
							active={activeOption === option.label}
							onClick={() => setActiveOption(option.label)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
