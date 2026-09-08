import type { PostHog } from "posthog-js";

export const HERO_REASSURANCE_FLAG = "marketing-hero-free-plan-reassurance";
export type ReassuranceVariant = "control" | "test";
export interface ReassuranceAssignment {
	variant: ReassuranceVariant;
	recordExposure: () => void;
}

type ExperimentClient = Pick<
	PostHog,
	"getFeatureFlag" | "onFeatureFlags" | "has_opted_out_capturing" | "capture"
>;

/** Resolve once; the caller records exposure after rendering the assigned arm. */
export function subscribeToReassurance(
	posthog: ExperimentClient,
	onAssignment: (assignment: ReassuranceAssignment) => void,
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
		const variant = posthog.getFeatureFlag(HERO_REASSURANCE_FLAG, {
			send_event: false,
		});
		if (variant !== "control" && variant !== "test") return;
		assigned = true;
		let exposed = false;
		onAssignment({
			variant,
			recordExposure: () => {
				if (disposed || exposed || posthog.has_opted_out_capturing()) return;
				exposed = true;
				// Use the rendered assignment, even if flags refreshed in between.
				// Explicit exposure also avoids the SDK's cross-session call cache.
				posthog.capture("$feature_flag_called", {
					$feature_flag: HERO_REASSURANCE_FLAG,
					$feature_flag_response: variant,
					[`$feature/${HERO_REASSURANCE_FLAG}`]: variant,
					experiment_surface: "marketing_hero",
				});
			},
		});
	});
	return () => {
		disposed = true;
		unsubscribe();
	};
}
