import type { UsageQuotaWindow } from "../trpc/router/usage/types.ts";
import { windowsInScope } from "./decision.ts";
import type { AccountAgent } from "./types.ts";

/** A stopped turn supplies its own model scope, independently of preferences. */
export function recoveryWindows(
	agent: AccountAgent,
	windows: readonly UsageQuotaWindow[],
	model: string | null,
): readonly UsageQuotaWindow[] {
	// An unknown model cannot justify ignoring a reported model limit.
	return model === null ? windows : windowsInScope(agent, windows, [model]);
}

/** Missing quota is unknown headroom, never permission to restart a session. */
export function hasRecoveryHeadroom(input: {
	agent: AccountAgent;
	model: string | null;
	sourceWindows: readonly UsageQuotaWindow[];
	targetWindows: readonly UsageQuotaWindow[];
	thresholdPercent: number;
}): boolean {
	const required = recoveryWindows(
		input.agent,
		input.sourceWindows,
		input.model,
	);
	const target = recoveryWindows(input.agent, input.targetWindows, input.model);
	return (
		required.length > 0 &&
		target.length > 0 &&
		required.every((window) =>
			target.some((other) => other.id === window.id),
		) &&
		target.every(
			(window) =>
				Number.isFinite(window.usedPercent) &&
				window.usedPercent < input.thresholdPercent,
		)
	);
}
