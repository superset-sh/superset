import { motion } from "framer-motion";
import { JoinWaitlistButton } from "../JoinWaitlistButton";

interface FeaturesSectionProps {
	onOpenWaitlist: () => void;
}

// Using the same SCALE_FEATURES from ScaleFeaturesSection
const FEATURES = [
	{
		title: "Work in parallel",
		description:
			"Run multiple agents in parallel. Build features as quickly as you can come up with them.",
	},
	{
		title: "No downtime",
		description:
			"Code on the go. Always-on agents that work even when you're away from your laptop.",
	},
	{
		title: "Zero switching cost",
		description:
			"Be the human in the loop. We handle the port switching and context management so you're never overloaded.",
	},
	{
		title: "Bring your own tools",
		description:
			"We're a superset of your existing tools, not a replacement. Use your own coding setup, tools, and agents. We bring the tooling and gluing.",
	},
] as const;

export function FeaturesSection({ onOpenWaitlist }: FeaturesSectionProps) {
	return (
		<section className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-8 bg-black">
			<div className="max-w-3xl mx-auto">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5 }}
					className="text-center mb-16 sm:mb-20"
				>
					<h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
						Build like a VP of Engineering
					</h2>
				</motion.div>

				<div className="space-y-8 sm:space-y-12">
					{FEATURES.map((feature, idx) => (
						<motion.div
							key={feature.title}
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true, margin: "-100px" }}
							transition={{ duration: 0.5, delay: idx * 0.1 }}
						>
							<h3 className="text-2xl sm:text-3xl font-semibold mb-3 text-white">
								{feature.title}
							</h3>
							<p className="text-base sm:text-lg text-zinc-400">
								{feature.description}
							</p>
						</motion.div>
					))}
				</div>

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.5, delay: 0.4 }}
					className="flex justify-center mt-16 sm:mt-20"
				>
					<JoinWaitlistButton onClick={onOpenWaitlist} />
				</motion.div>
			</div>
		</section>
	);
}
