"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { m } from "framer-motion";
import { HOW_IT_WORKS_STEPS } from "./constants";

export function HowItWorksSection() {
	const { t } = useLingui();

	return (
		<section id="how-it-works" className="relative py-24 sm:py-32">
			<div className="max-w-7xl mx-auto px-6 sm:px-8">
				<m.div
					className="mb-16 sm:mb-20 space-y-4"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<span className="text-sm font-mono uppercase tracking-widest text-brand">
						<Trans id="marketing.howItWorks.eyebrow">How it works</Trans>
					</span>
					<h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1] text-foreground">
						<Trans id="marketing.howItWorks.headline">
							The best agent will change.
							<br />
							Your workflow shouldn&apos;t.
						</Trans>
					</h2>
				</m.div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 lg:gap-12">
					{HOW_IT_WORKS_STEPS.map((step, index) => (
						<m.div
							key={step.number}
							className="space-y-4 border-t border-border pt-6"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.1 * index }}
						>
							<span className="text-sm font-mono text-brand">
								{step.number}
							</span>
							<h3 className="text-xl sm:text-2xl font-medium tracking-tight text-foreground">
								{t(step.title)}
							</h3>
							<p className="text-base text-muted-foreground leading-relaxed">
								{t(step.description)}
							</p>
						</m.div>
					))}
				</div>
			</div>
		</section>
	);
}
