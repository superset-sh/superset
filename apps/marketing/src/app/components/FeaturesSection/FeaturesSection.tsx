"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface Feature {
	tag: string;
	title: string;
	description: string;
	imageSrc?: string;
	imageAlt: string;
}

const FEATURES: Feature[] = [
	{
		tag: "Parallel Execution",
		title: "Run dozens of agents at once",
		description:
			"Launch multiple AI coding agents simultaneously across different tasks. Work on features, fix bugs, and refactor code — all in parallel. Each agent runs independently while you maintain full visibility.",
		imageSrc: "/features/parallel-agents.png",
		imageAlt: "Multiple AI agents running in parallel in Superset",
	},
	{
		tag: "Universal Compatibility",
		title: "Works with any CLI agent",
		description:
			"Superset is agent-agnostic. Use Claude Code, Codex, Aider, or any CLI-based coding tool. Switch between agents seamlessly without changing your workflow.",
		imageSrc: "/features/cli-agents.png",
		imageAlt: "Various CLI agents running in Superset",
	},
	{
		tag: "Isolation",
		title: "Git worktrees keep everything clean",
		description:
			"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
		imageSrc: "/features/git-worktrees.png",
		imageAlt: "Git worktree isolation in Superset",
	},
];

function FeatureImage({ src, alt }: { src?: string; alt: string }) {
	// Check if image exists by trying to load it - for now show placeholder
	// Replace with actual images when available
	const showPlaceholder = true;

	return (
		<div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-muted border border-border">
			{!showPlaceholder && src ? (
				<Image
					src={src}
					alt={alt}
					fill
					className="object-cover"
					sizes="(max-width: 768px) 100vw, 50vw"
				/>
			) : (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="text-muted-foreground/40 text-sm font-mono">
						Screenshot
					</div>
				</div>
			)}
		</div>
	);
}

export function FeaturesSection() {
	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-[1200px] mx-auto">
				{/* Section Header */}
				<motion.div
					className="mb-20"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-1">
						<h2 className="text-2xl sm:text-3xl font-mono tracking-[-0.01em] text-foreground">
							Features
						</h2>
						<p className="text-lg sm:text-xl font-light tracking-[-0.03em] text-muted-foreground max-w-[700px]">
							Everything you need to supercharge your AI-assisted development
							workflow.
						</p>
					</div>
				</motion.div>

				{/* Feature Rows */}
				<div className="space-y-32">
					{FEATURES.map((feature, index) => {
						const isReversed = index % 2 === 1;

						return (
							<motion.div
								key={feature.title}
								className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center ${
									isReversed ? "lg:direction-rtl" : ""
								}`}
								initial={{ opacity: 0, y: 40 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-100px" }}
								transition={{ duration: 0.6 }}
							>
								{/* Text Content */}
								<div
									className={`space-y-6 ${isReversed ? "lg:order-2" : "lg:order-1"}`}
								>
									<div className="space-y-4">
										<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
											{feature.tag}
										</span>
										<h3 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-foreground">
											{feature.title}
										</h3>
									</div>
									<p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-[500px]">
										{feature.description}
									</p>
								</div>

								{/* Image */}
								<div className={`${isReversed ? "lg:order-1" : "lg:order-2"}`}>
									<FeatureImage src={feature.imageSrc} alt={feature.imageAlt} />
								</div>
							</motion.div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
