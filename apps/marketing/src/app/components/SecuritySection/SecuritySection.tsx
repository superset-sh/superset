"use client";

import { m } from "framer-motion";
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
		icon: <HiOutlineCodeBracket className="w-5 h-5 text-foreground/70" />,
		title: "Source Available",
		description:
			"Full source available on GitHub under Elastic License 2.0 (ELv2). Inspect, audit, and contribute to the code. No black boxes, no hidden functionality.",
	},
	{
		icon: <HiOutlineServerStack className="w-5 h-5 text-foreground/70" />,
		title: "Local First",
		description:
			"Repos, worktrees, terminal output, and agent sessions stay on your machine. Cloud sync covers account and organization metadata only.",
	},
	{
		icon: <HiOutlineSignal className="w-5 h-5 text-foreground/70" />,
		title: "Your Agents, Your Accounts",
		description:
			"Use your existing agent subscriptions and API keys. Superset never proxies model calls or locks your workflow to one provider.",
	},
];

export function SecuritySection() {
	return (
		<section id="security" className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				{/* Heading */}
				<m.div
					className="mb-16 space-y-4"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<span className="text-sm font-mono uppercase tracking-widest text-brand">
						Security
					</span>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1] text-foreground">
						Private by default.
						<br />
						You&apos;re in control.
					</h2>
					<p className="text-base sm:text-lg font-light text-muted-foreground max-w-[700px]">
						Your code stays local by default, with explicit control over
						connected services.
					</p>
				</m.div>

				{/* Features Grid */}
				<m.div
					className="grid grid-cols-1 md:grid-cols-3 gap-6"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.2 }}
				>
					{SECURITY_FEATURES.map((feature, index) => (
						<m.div
							key={feature.title}
							className="relative p-6 rounded-[2px] border border-foreground/[0.1] bg-foreground/[0.03]"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.1 * index }}
						>
							<div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-[2px] bg-muted border border-border">
								{feature.icon}
							</div>
							<h3 className="text-lg font-medium text-foreground/90 mb-2">
								{feature.title}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{feature.description}
							</p>
						</m.div>
					))}
				</m.div>
			</div>
		</section>
	);
}
