import type { DraftTrigger } from "@superset/shared/automation-triggers";
import type { PlanTier } from "@superset/shared/billing";
import {
	planAllowsTriggerKind,
	requiredPlanForTriggerKind,
} from "@superset/shared/billing";
import { providerFor } from "../providers";
import type { ProviderOptions, TriggerProvider } from "../providers/types";

/**
 * The tier badge for a provider the viewer's plan can't add, or null when it
 * can. The dispatcher enforces the same shared map — an above-tier trigger
 * stays editable but never fires.
 */
export function lockedTierFor(
	provider: TriggerProvider,
	plan: PlanTier,
): string | null {
	const required = requiredPlanForTriggerKind(provider.kind);
	if (!required || planAllowsTriggerKind(plan, provider.kind)) return null;
	return required === "enterprise" ? "Enterprise" : "Pro";
}

/**
 * Everything the editor has to say about the world the rows point at: a plan
 * that will not run them, and each provider's own reasons a valid trigger
 * stays silent.
 *
 * Deduplicated, because two rows watching the same channel earn the same
 * sentence and saying it twice reads as two different problems. Pure, so the
 * cases can be varied without standing up the queries the editor needs to
 * render — which is the only reason this is not inline where it is used.
 */
export function collectRuntimeWarnings(
	drafts: DraftTrigger[],
	options: ProviderOptions,
	plan: PlanTier,
): string[] {
	const seen = new Set<string>();
	for (const draft of drafts) {
		const provider = providerFor(draft.config);
		// A downgraded organization keeps its rows; the warning names the tier
		// they came from rather than hiding them.
		const tier = lockedTierFor(provider, plan);
		if (tier) seen.add(`${provider.label} triggers require the ${tier} plan.`);
		for (const warning of provider.runtimeWarnings?.(draft.config, options) ??
			[]) {
			seen.add(warning);
		}
	}
	return [...seen];
}
