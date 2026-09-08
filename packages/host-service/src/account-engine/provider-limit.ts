import type { AccountAgent } from "./types.ts";

export interface LimitStopEvidence {
	model: string | null;
	source: "terminal" | "structured";
}

/** Provider wording stays here; callers receive only the affected model. */
export function observeProviderLimit(
	agent: AccountAgent,
	screen: string,
): LimitStopEvidence | null {
	if (agent === "codex") {
		return /You['’]ve (?:hit|reached) your usage limit/i.test(screen)
			? { model: null, source: "terminal" }
			: null;
	}
	const match = /You['’]ve (?:hit|reached) your(?: ([^\n]*?))? limit\b/i.exec(
		screen,
	);
	if (!match) return null;
	const scope = (match[1] ?? "").trim();
	const generic =
		/^(?:(?:session|weekly|usage|daily|monthly|\d+[- ]hour|\d+[- ]day)\s*)*$/i.test(
			scope,
		);
	return { model: generic ? null : scope, source: "terminal" };
}
