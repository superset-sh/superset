"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<string>(
		DEMO_OPTIONS[0]?.label ?? "",
	);

	return (
		<div className="relative w-full flex flex-col gap-3">
			<div
				className="relative w-full rounded-lg overflow-hidden"
				style={{ aspectRatio: "1812/1080" }}
			>
				{DEMO_OPTIONS.map((option) => (
					<motion.div
						key={option.label}
						className="absolute inset-0"
						initial={false}
						animate={{ opacity: activeOption === option.label ? 1 : 0 }}
						transition={{ duration: 0.5, ease: "easeInOut" }}
					>
						<video
							src={option.videoPath}
							autoPlay
							loop
							muted
							playsInline
							className="w-full h-full object-contain rounded-lg border border-border"
						/>
					</motion.div>
				))}
			</div>

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
	);
}
