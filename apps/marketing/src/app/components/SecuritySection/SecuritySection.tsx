"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
	HiOutlineCodeBracket,
	HiOutlineServerStack,
	HiOutlineSignal,
} from "react-icons/hi2";

const SECURITY_FEATURES: {
	icon: ReactNode;
	title: string;
	description: string;
}[] = [
	{
		icon: <HiOutlineCodeBracket className="w-5 h-5 text-white/70" />,
		title: "Open Source",
		description:
			"Fully open source codebase. Inspect, audit, and contribute to the code. No black boxes, no hidden functionality.",
	},
	{
		icon: <HiOutlineServerStack className="w-5 h-5 text-white/70" />,
		title: "Offline First",
		description:
			"Your code stays on your machine. Work without an internet connection. All processing happens locally.",
	},
	{
		icon: <HiOutlineSignal className="w-5 h-5 text-white/70" />,
		title: "No Network Required",
		description:
			"Zero telemetry by default. No data leaves your machine unless you explicitly connect to external services.",
	},
];

export function SecuritySection() {
	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-[1200px] mx-auto">
				{/* Heading */}
				<motion.div
					className="mb-16"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-1">
						<h2 className="text-2xl sm:text-3xl font-mono tracking-[-0.01em] text-stone-100">
							Private by default
						</h2>
						<h2 className="text-lg sm:text-xl font-light tracking-[-0.03em] text-neutral-400 max-w-[700px]">
							Your code never leaves your machine.
						</h2>
					</div>
				</motion.div>

				{/* Features Grid */}
				<motion.div
					className="grid grid-cols-1 md:grid-cols-3 gap-6"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.2 }}
				>
					{SECURITY_FEATURES.map((feature, index) => (
						<motion.div
							key={feature.title}
							className="relative p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.1 * index }}
						>
							<div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 border border-white/10">
								{feature.icon}
							</div>
							<h3 className="text-lg font-medium text-white/90 mb-2">
								{feature.title}
							</h3>
							<p className="text-sm leading-relaxed text-white/50">
								{feature.description}
							</p>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
