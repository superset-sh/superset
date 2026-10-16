import { COMPANY } from "@superset/shared/constants";
import { useEffect, useState } from "react";
import { detectPlatform, isMacPlatform } from "@/app/[lang]/hooks/useOS";
import { withPosthog } from "@/lib/analytics/lazy";
import {
	type HeadlineAssignment,
	isHeadlineVariant,
	subscribeToHeadlineVariant,
} from "../../utils/subscribeToHeadlineVariant";

// PostHog loads lazily after the page, so flags can take a moment. Past this
// wait the headline types control copy and the visitor is not enrolled.
const FLAG_WAIT_MS = 1500;

const CONTROL: HeadlineAssignment = {
	variant: "control",
	recordExposure: () => {},
};

function isProductionHost(): boolean {
	const productionHost = new URL(COMPANY.MARKETING_URL).hostname;
	return (
		process.env.NODE_ENV === "production" &&
		(window.location.hostname === productionHost ||
			window.location.hostname === `www.${productionHost}`)
	);
}

/** Null until the headline copy is decided; the typewriter waits for it. */
export function useHeadlineVariant(): HeadlineAssignment | null {
	const [assignment, setAssignment] = useState<HeadlineAssignment | null>(null);

	useEffect(() => {
		if (!isProductionHost()) {
			const preview = new URLSearchParams(window.location.search).get(
				"hero-headline-preview",
			);
			setAssignment(
				isHeadlineVariant(preview)
					? { variant: preview, recordExposure: () => {} }
					: CONTROL,
			);
			return;
		}

		let disposed = false;
		let settled = false;
		let unsubscribe: (() => void) | undefined;
		const settle = (next: HeadlineAssignment) => {
			if (disposed || settled) return;
			settled = true;
			setAssignment(next);
		};
		const fallback = setTimeout(() => settle(CONTROL), FLAG_WAIT_MS);

		void detectPlatform().then(({ platform }) => {
			if (disposed) return;
			if (!isMacPlatform(platform)) {
				settle(CONTROL);
				return;
			}
			withPosthog((posthog) => {
				if (disposed || settled) return;
				unsubscribe = subscribeToHeadlineVariant(posthog, settle);
			});
		});

		return () => {
			disposed = true;
			clearTimeout(fallback);
			unsubscribe?.();
		};
	}, []);

	return assignment;
}
