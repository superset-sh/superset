import type { PostHog } from "posthog-js";

export const HERO_HEADLINE_FLAG = "marketing-hero-headline";
export const HEADLINE_VARIANTS = ["control", "ide", "army"] as const;
export type HeadlineVariant = (typeof HEADLINE_VARIANTS)[number];

export interface HeadlineAssignment {
	variant: HeadlineVariant;
	recordExposure: () => void;
}

type ExperimentClient = Pick<
	PostHog,
	"getFeatureFlag" | "onFeatureFlags" | "has_opted_out_capturing" | "capture"
>;

export function isHeadlineVariant(value: unknown): value is HeadlineVariant {
	return HEADLINE_VARIANTS.includes(value as HeadlineVariant);
}

/** Resolve once; the caller records exposure after rendering the assigned arm. */
export function subscribeToHeadlineVariant(
	posthog: ExperimentClient,
	onAssignment: (assignment: HeadlineAssignment) => void,
): () => void {
	let disposed = false;
	let assigned = false;
	const unsubscribe = posthog.onFeatureFlags((_flags, _variants, context) => {
		if (
			disposed ||
			assigned ||
			context?.errorsLoading ||
			posthog.has_opted_out_capturing()
		) {
			return;
		}
		const variant = posthog.getFeatureFlag(HERO_HEADLINE_FLAG, {
			send_event: false,
		});
		if (!isHeadlineVariant(variant)) return;
		assigned = true;
		let exposed = false;
		onAssignment({
			variant,
			recordExposure: () => {
				if (disposed || exposed || posthog.has_opted_out_capturing()) return;
				exposed = true;
				posthog.capture("$feature_flag_called", {
					$feature_flag: HERO_HEADLINE_FLAG,
					$feature_flag_response: variant,
					[`$feature/${HERO_HEADLINE_FLAG}`]: variant,
					experiment_surface: "marketing_hero_headline",
				});
			},
		});
	});
	return () => {
		disposed = true;
		unsubscribe();
	};
}
