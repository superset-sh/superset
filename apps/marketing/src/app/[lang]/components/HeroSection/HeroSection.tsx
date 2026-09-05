"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const { t } = useLingui();

	const headlineSegments = [
		{
			id: "lead",
			// Typed newline, not a space: the headline is always two lines, and
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
			className: "corner-brackets px-[0.2em] py-[0.06em] whitespace-nowrap",
		},
	];

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						{/* Hiring pill: in-flow badge above the headline */}
						<Link
							href="/join-us"
							className="group mb-6 sm:mb-8 inline-flex w-max items-center gap-2 whitespace-nowrap rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2]"
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
						<div className="space-y-4 sm:space-y-6">
							<h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] [word-spacing:0.15em] whitespace-pre-line text-foreground relative max-w-6xl mx-auto">
								{/* Real headline for screen readers and no-JS crawlers; the
								    typewriter below is purely visual */}
								<span className="sr-only">
									{headlineSegments.map((segment) => segment.text).join("")}
								</span>
								{/* Sizer must mirror the visible segments' styling so wrapping matches */}
								<span className="invisible" aria-hidden="true">
									{headlineSegments.map((segment) => (
										<span key={segment.id} className={segment.className}>
											{segment.text}
										</span>
									))}
								</span>
								<span className="absolute inset-0" aria-hidden="true">
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
								className="text-base sm:text-xl font-light text-muted-foreground max-w-4xl mx-auto"
							>
								<Trans>
									One workspace for Claude Code, Codex, and any coding agent.
								</Trans>
							</p>
						</div>

						<div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-6 sm:mt-8">
							<DownloadButton onJoinWaitlist={() => setIsWaitlistOpen(true)} />
							<button
								type="button"
								className="px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal bg-background border border-border text-foreground hover:bg-muted transition-colors flex items-center gap-2"
								onClick={() => window.open(COMPANY.GITHUB_URL, "_blank")}
								aria-label={t({
									message: "View on GitHub",
								})}
							>
								<Trans>View on GitHub</Trans>
								<FaGithub className="size-4" />
							</button>
						</div>
					</div>

					<div className="relative w-full mt-20 sm:mt-32 lg:mt-40">
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
