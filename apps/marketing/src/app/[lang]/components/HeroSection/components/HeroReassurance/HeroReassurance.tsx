"use client";

import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { isMacPlatform, usePlatform } from "@/app/[lang]/hooks/useOS";
import { withPosthog } from "@/lib/analytics/lazy";
import {
	type ReassuranceAssignment,
	subscribeToReassurance,
} from "./utils/subscribeToReassurance";

export function HeroReassurance() {
	const { platform } = usePlatform();
	const [assignment, setAssignment] = useState<ReassuranceAssignment | null>(
		null,
	);
	const ref = useRef<HTMLParagraphElement>(null);
	const isInView = useInView(ref, { amount: 1 });

	useEffect(() => {
		const productionHost = new URL(COMPANY.MARKETING_URL).hostname;
		const isProductionHost =
			process.env.NODE_ENV === "production" &&
			(window.location.hostname === productionHost ||
				window.location.hostname === `www.${productionHost}`);
		if (!isProductionHost) {
			// Preview either arm locally/on Vercel without production exposures.
			const preview = new URLSearchParams(window.location.search).get(
				"hero-reassurance-preview",
			);
			if (preview === "control" || preview === "test") {
				setAssignment({ variant: preview, recordExposure: () => {} });
			}
			return;
		}
		if (!isMacPlatform(platform)) return;
		let disposed = false;
		let unsubscribe: (() => void) | undefined;
		withPosthog((posthog) => {
			if (disposed) return;
			unsubscribe = subscribeToReassurance(posthog, setAssignment);
		});
		return () => {
			disposed = true;
			unsubscribe?.();
		};
	}, [platform]);

	useEffect(() => {
		if (!assignment || !isInView) return;
		const recordWhenVisible = () => {
			if (document.visibilityState === "visible") assignment.recordExposure();
		};
		recordWhenVisible();
		document.addEventListener("visibilitychange", recordWhenVisible);
		return () =>
			document.removeEventListener("visibilitychange", recordWhenVisible);
	}, [assignment, isInView]);

	const showReassurance = assignment?.variant === "test";
	return (
		<p
			ref={ref}
			data-experiment="marketing-hero-free-plan-reassurance"
			data-variant={assignment?.variant ?? "unassigned"}
			className="mt-3 max-w-sm text-pretty text-xs leading-relaxed text-muted-foreground sm:text-sm"
		>
			{/* Both arms reserve the same space, isolating copy from layout changes
			    and avoiding a shift when the lazily loaded flags resolve. */}
			<span
				className={showReassurance ? undefined : "invisible"}
				aria-hidden={!showReassurance}
			>
				<Trans>Free plan available · No credit card required</Trans>
			</span>
		</p>
	);
}
