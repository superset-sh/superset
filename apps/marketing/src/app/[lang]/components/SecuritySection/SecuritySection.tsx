"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { m } from "framer-motion";
import type { ReactNode } from "react";
import {
	HiOutlineCodeBracket,
	HiOutlineServerStack,
	HiOutlineSignal,
} from "react-icons/hi2";
import { Soc2Badge } from "../Soc2Badge";

const SECURITY_FEATURES: {
	id: string;
	icon: ReactNode;
	title: MessageDescriptor;
	description: MessageDescriptor;
}[] = [
	{
		id: "source-available",
		icon: <HiOutlineCodeBracket className="w-5 h-5 text-foreground/70" />,
		title: msg({
			message: "Source Available",
		}),
		description: msg({
			message:
				"Full source available on GitHub under Elastic License 2.0 (ELv2). Inspect, audit, and contribute to the code. No black boxes, no hidden functionality.",
		}),
	},
	{
		id: "local-first",
		icon: <HiOutlineServerStack className="w-5 h-5 text-foreground/70" />,
		title: msg({
			message: "Local First",
		}),
		description: msg({
			message:
				"Repos, worktrees, terminal output, and agent sessions stay on your machine. Cloud sync covers account and organization metadata only.",
		}),
	},
	{
		id: "your-accounts",
		icon: <HiOutlineSignal className="w-5 h-5 text-foreground/70" />,
		title: msg({
			message: "Your Agents, Your Accounts",
		}),
		description: msg({
			message:
				"Use your existing agent subscriptions and API keys. Superset never proxies model calls or locks your workflow to one provider.",
		}),
	},
];

export function SecuritySection() {
	const { t } = useLingui();

	return (
		<section id="security" className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				{/* Heading */}
				<m.div
					className="mb-16 flex items-start justify-between gap-8"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-4">
						<span className="text-sm font-mono uppercase tracking-widest text-brand">
							<Trans>Security</Trans>
						</span>
						<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1] text-foreground">
							<Trans>
								Private by default.
								<br />
								You&apos;re in control.
							</Trans>
						</h2>
						<p className="text-base sm:text-lg font-light text-muted-foreground max-w-[700px]">
							<Trans>
								Your code stays local by default, with explicit control over
								connected services.
							</Trans>
						</p>
					</div>
					<a
						href={COMPANY.TRUST_URL}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={t({
							message: "SOC 2 Type II compliant. Request our report.",
						})}
						className="hidden sm:block shrink-0 text-muted-foreground transition-colors hover:text-foreground"
					>
						<Soc2Badge size={128} />
					</a>
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
							key={feature.id}
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
								{t(feature.title)}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{t(feature.description)}
							</p>
						</m.div>
					))}
				</m.div>
			</div>
		</section>
	);
}
