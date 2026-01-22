"use client";

import { MeshGradient } from "@superset/ui/mesh-gradient";
import { motion } from "framer-motion";
import { useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

export function ProductDemo() {
	const [activeOption, setActiveOption] = useState<ActiveDemo>("Use Any Agents");

	return (
		<div className="relative w-full max-w-full rounded-lg overflow-hidden">
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
				{/* App mockup container */}
				<AppMockup activeDemo={activeOption} />

				{/* Selector pills */}
				<div className="flex items-center gap-2 overflow-x-auto">
					{DEMO_OPTIONS.map((option) => (
						<SelectorPill
							key={option.label}
							label={option.label}
							active={activeOption === option.label}
							onHover={() => setActiveOption(option.label as ActiveDemo)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
