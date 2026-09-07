"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { HeroReassurance } from "./components/HeroReassurance";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const { t } = useLingui();

	const headlineSegments = [
		{
			id: "lead",
			// Start the emphasis on a new line; longer translations can wrap, and
			// the break arrives as part of the animation (the caret drops to the
			// second line) instead of the second segment starting on line one and
			// reflowing down once it outgrows the width. Needs the h1's
			// whitespace-pre-line to render.
			text: `${t({
				message: "Bring Any Agent.",
			})}\n`,
		},
		{
			id: "emphasis",
			text: t({
				message: "Orchestrate Them All.",
			}),
			// Beat on the empty second line before the payoff line types
			delayBefore: 450,
			// Plain inline (not inline-block): vertical padding on inline boxes
			// paints the brackets without affecting line height, so the line
			// can't jump when this segment mounts mid-animation
			className: "corner-brackets box-decoration-clone px-[0.2em] py-[0.06em]",
		},
	];

	return (
		<div>
			<div className="relative flex flex-col items-center pt-16 sm:pt-20 lg:pt-24 pb-12 sm:pb-16 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						{/* Hiring pill: in-flow badge above the headline */}
						<Link
							href="/join-us"
							className="group mb-6 sm:mb-8 inline-flex w-max items-center gap-2 whitespace-nowrap rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
						>
							<span className="text-brand shrink-0">●</span>
							<span>
								<span className="sm:hidden">
									<Trans>We&apos;re hiring engineers</Trans>
								</span>
								<span className="hidden sm:inline">
									<Trans>We&apos;re hiring engineers in San Francisco</Trans>
								</span>
							</span>
							<span className="shrink-0 transition-transform group-hover:translate-x-0.5">
								→
							</span>
						</Link>
						<div className="w-full space-y-6 sm:space-y-8">
							<h1 className="text-[clamp(2rem,5.5vw,4.5rem)] font-medium tracking-[-0.045em] leading-[1.2] whitespace-pre-line text-foreground relative max-w-5xl mx-auto">
								{/* Real headline for screen readers and no-JS crawlers; the
								    typewriter below is purely visual */}
								<span className="sr-only">
									{headlineSegments.map((segment) => segment.text).join("")}
								</span>
								{/* Sizer must mirror the visible segments' styling so wrapping matches */}
								<span
									className="invisible motion-reduce:visible"
									aria-hidden="true"
								>
									{headlineSegments.map((segment) => (
										<span key={segment.id} className={segment.className}>
											{segment.text}
										</span>
									))}
								</span>
								<span
									className="absolute inset-0 motion-reduce:hidden"
									aria-hidden="true"
								>
									<TypewriterText
										segments={headlineSegments}
										speed={40}
										delay={600}
										// Caret matches the corner-bracket box height (1.30em) for the
										// whole animation; drawn via scale-y so its layout height stays
										// 0.72em and can't inflate the line box
										cursorClassName="inline-block ml-0.5 w-3 -mr-3.5 h-[0.72em] origin-bottom scale-y-[1.806] translate-y-[0.268em] bg-brand"
									/>
								</span>
							</h1>
							<p
								id="hero-subheadline"
								className="text-base sm:text-lg leading-relaxed text-pretty text-muted-foreground max-w-xl mx-auto"
							>
								<Trans>
									One workspace for Claude Code, Codex, and any coding agent.
								</Trans>
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-center gap-3 mt-8 sm:mt-10">
							<DownloadButton
								source="hero"
								className="min-h-12 justify-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
								onJoinWaitlist={() => setIsWaitlistOpen(true)}
							/>
							<a
								href={COMPANY.GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="min-h-12 px-4 py-2.5 sm:px-6 text-sm sm:text-base font-normal bg-background/80 border border-border text-foreground hover:bg-muted hover:border-foreground/25 transition-colors flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
								aria-label={t({
									message: "View on GitHub",
								})}
							>
								<Trans>View on GitHub</Trans>
								<FaGithub className="size-4" />
							</a>
						</div>
						<HeroReassurance />
					</div>

					<div className="relative w-full mt-12 sm:mt-16 lg:mt-20">
						<ProductDemo />
					</div>
				</div>
			</div>
			<WaitlistModal
				isOpen={isWaitlistOpen}
				onClose={() => setIsWaitlistOpen(false)}
			/>
		</div>
	);
}
