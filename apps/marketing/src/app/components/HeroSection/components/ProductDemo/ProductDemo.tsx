"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useState } from "react";
import { type ActiveDemo, AppMockup } from "../AppMockup";
import { SelectorPill } from "./components/SelectorPill";
import { DEMO_OPTIONS } from "./constants";

const MeshGradient = dynamic(
	() => import("@superset/ui/mesh-gradient").then((mod) => mod.MeshGradient),
	{ ssr: false },
);

export function ProductDemo() {
	const [activeOption, setActiveOption] =
		useState<ActiveDemo>("Use Any Agents");

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

			{/* Content wrapper - no right padding on mobile so content touches edge */}
			<div className="relative flex flex-col gap-3 sm:gap-4 py-4 pl-4 sm:p-6">
				{/* App mockup - horizontally scrollable on mobile */}
				<div className="overflow-x-auto scrollbar-hide">
					<AppMockup activeDemo={activeOption} />
				</div>

				{/* Selector pills - horizontally scrollable on mobile */}
				<div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
					{DEMO_OPTIONS.map((option) => (
						<SelectorPill
							key={option.label}
							label={option.label}
							active={activeOption === option.label}
							onSelect={() => setActiveOption(option.label as ActiveDemo)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
