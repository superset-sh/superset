"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useInView } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FaApple, FaGithub } from "react-icons/fa";
import { track } from "@/lib/analytics";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";
import { BoidsBackground } from "./components/BoidsBackground";
import { ProductDemo } from "./components/ProductDemo";
import { TypewriterText } from "./components/TypewriterText";
import { useHeadlineVariant } from "./hooks/useHeadlineVariant";
import type { HeadlineVariant } from "./utils/subscribeToHeadlineVariant";

export function HeroSection() {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const [isIOS, setIsIOS] = useState(false);

	useEffect(() => {
		setIsIOS(
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
				(/macintosh/i.test(navigator.userAgent) &&
					navigator.maxTouchPoints > 1),
		);
	}, []);
	const { t, i18n } = useLingui();

	const assignment = useHeadlineVariant();
	const headlineRef = useRef<HTMLHeadingElement>(null);
	const isHeadlineInView = useInView(headlineRef, { amount: 0.5 });

	useEffect(() => {
		if (!assignment || !isHeadlineInView) return;
		const recordWhenVisible = () => {
			if (document.visibilityState === "visible") assignment.recordExposure();
		};
		recordWhenVisible();
		document.addEventListener("visibilitychange", recordWhenVisible);
		return () =>
			document.removeEventListener("visibilitychange", recordWhenVisible);
	}, [assignment, isHeadlineInView]);

	const headlines: Record<HeadlineVariant, [lead: string, emphasis: string]> = {
		control: [
			t({ message: "Bring Any Agent" }),
			t({ message: "Orchestrate Them All" }),
		],
		ide: [
			t({
				message: "The IDE for",
				comment:
					"Homepage headline, line 1 of 2. Line 2 is “Parallel Agents”; reorder the two lines if the language needs it.",
			}),
			t({
				message: "Parallel Agents",
				comment:
					"Homepage headline, line 2 of 2, after “The IDE for”. Shown in a scanline style.",
			}),
		],
		army: [
			t({
				message: "Run an Army of",
				comment:
					"Homepage headline, line 1 of 2. Line 2 is “Coding Agents”; reorder the two lines if the language needs it.",
			}),
			t({
				message: "Coding Agents",
				comment:
					"Homepage headline, line 2 of 2, after “Run an Army of”. Shown in a scanline style.",
			}),
		],
	};
	const [lead, emphasis] = headlines[assignment?.variant ?? "control"];

	const headlineSegments = [
		{
			id: "lead",
			// Typed newline, not a space: the headline is always two lines, and
			// the break arrives as part of the animation (the caret drops to the
			// second line) instead of the second segment starting on line one and
			// reflowing down once it outgrows the width. Needs the h1's
			// whitespace-pre-line to render.
			text: `${lead}\n`,
		},
		{
			id: "emphasis",
			text: emphasis,
			// Beat on the empty second line before the payoff line types
			delayBefore: 450,
			className:
				"scanline-text text-foreground drop-shadow-[0_0_14px_color-mix(in_srgb,var(--foreground)_22%,transparent)]",
		},
	];

	return (
		<div>
			<div className="relative flex flex-col items-center pt-24 sm:pt-32 lg:pt-40 pb-16 sm:pb-24 overflow-hidden">
				<BoidsBackground />
				<div className="relative w-full max-w-7xl mx-auto px-6 sm:px-8">
					<div className="flex flex-col items-center text-center">
						<Link
							href={
								i18n.locale === "en"
									? "/blog/a-new-name"
									: `/${i18n.locale}/blog/a-new-name`
							}
							className="group mb-6 sm:mb-8 inline-flex max-w-full items-center gap-2 rounded-[2px] border border-border bg-background/80 px-3 py-1.5 text-xs font-mono text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/[0.2]"
						>
							<span
								aria-hidden="true"
								className="size-1.5 shrink-0 rounded-full bg-brand"
							/>
							<span>
								<Trans>Superset is getting a new name soon</Trans>
							</span>
							<span
								aria-hidden="true"
								className="shrink-0 transition-transform group-hover:translate-x-0.5"
							>
								→
							</span>
						</Link>
						<div className="space-y-4 sm:space-y-6">
							<h1
								ref={headlineRef}
								className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight leading-[1.1] [word-spacing:0.15em] whitespace-pre-line text-foreground relative max-w-6xl mx-auto"
							>
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
									{assignment && (
										<TypewriterText
											key={assignment.variant}
											segments={headlineSegments}
											speed={40}
											delay={600}
											cursorClassName="inline-block ml-0.5 w-3 -mr-3.5 h-[0.72em] bg-brand"
										/>
									)}
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
							<DownloadButton
								source="hero"
								onJoinWaitlist={() => setIsWaitlistOpen(true)}
							/>
							<Link
								href={
									isIOS
										? COMPANY.APP_STORE_URL
										: i18n.locale === "en"
											? "/mobile"
											: `/${i18n.locale}/mobile`
								}
								onClick={() =>
									isIOS
										? track("mobile_store_clicked", {
												store: "app_store",
												source: "hero",
											})
										: track("mobile_page_clicked", { source: "hero" })
								}
								aria-label={t({ message: "Superset for iPhone and iPad" })}
								className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
							>
								<FaApple aria-hidden="true" className="size-5" />
							</Link>
							<button
								type="button"
								className="flex size-11 shrink-0 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand sm:size-12"
								onClick={() => {
									track("github_clicked", { source: "hero" });
									window.open(
										COMPANY.GITHUB_URL,
										"_blank",
										"noopener,noreferrer",
									);
								}}
								aria-label={t({
									message: "View on GitHub",
								})}
							>
								<FaGithub aria-hidden="true" className="size-5" />
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
