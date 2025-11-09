import { Card } from "@superset/ui/card";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { SCALE_FEATURES } from "../../constants";

interface ScaleFeatureCardProps {
	feature: (typeof SCALE_FEATURES)[number];
	delay: number;
	shadowColor?: "blue" | "green";
	className?: string;
	children: ReactNode;
}

export function ScaleFeatureCard({
	feature,
	delay,
	shadowColor = "blue",
	className = "",
	children,
}: ScaleFeatureCardProps) {
	const shadowClass =
		shadowColor === "green"
			? "hover:shadow-green-500/10"
			: "hover:shadow-blue-500/10";

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-100px" }}
			transition={{ duration: 0.5, delay }}
			whileHover={{ y: -1, transition: { duration: 0.2 } }}
			className={className}
		>
			<Card
				className={`p-4 sm:p-6 md:p-8 bg-zinc-950 border-zinc-800 rounded-2xl sm:rounded-3xl h-full min-h-[350px] sm:min-h-[400px] flex flex-col justify-between transition-shadow hover:shadow-2xl ${shadowClass} hover:border-zinc-700`}
			>
				<div>
					<h3 className="text-xl sm:text-2xl font-semibold mb-2 sm:mb-3 text-white">
						{feature.title}
					</h3>
					<p className="text-sm sm:text-base text-zinc-400 mb-4 sm:mb-6">
						{feature.description}
					</p>
					<a
						href="/#"
						className="text-sm sm:text-base text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-2 group"
					>
						{feature.link}
						<motion.span
							className="inline-block"
							whileHover={{ x: 4 }}
							transition={{ duration: 0.2 }}
						>
							→
						</motion.span>
					</a>
				</div>
				{children}
			</Card>
		</motion.div>
	);
}
