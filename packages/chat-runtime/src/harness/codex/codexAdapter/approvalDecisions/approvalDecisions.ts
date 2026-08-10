import type { Decision } from "@superset/chat/protocol";

export type CodexDecisionOption = {
	optionId: string;
	label: string;
	value: unknown;
};

const DECISION_LABELS: Record<string, string> = {
	accept: "Approve",
	acceptForSession: "Approve for the rest of this session",
	decline: "Decline",
	cancel: "Stop",
	acceptWithExecpolicyAmendment: "Approve and always allow this command",
	applyNetworkPolicyAmendment: "Approve and allow this network access",
};

function optionIdOf(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		const [key] = Object.keys(value);
		return key ?? null;
	}
	return null;
}

export function decisionOptions(available: unknown): CodexDecisionOption[] {
	if (!Array.isArray(available)) return [];
	const options: CodexDecisionOption[] = [];
	for (const value of available) {
		const optionId = optionIdOf(value);
		if (!optionId) continue;
		options.push({
			optionId,
			label: DECISION_LABELS[optionId] ?? optionId,
			value,
		});
	}
	return options;
}

export function codexDecision(
	decision: Decision,
	options: CodexDecisionOption[],
): unknown {
	switch (decision.type) {
		case "accept":
			return "accept";
		case "accept_for_session":
			return "acceptForSession";
		case "decline":
			return "decline";
		case "cancel":
			return "cancel";
		case "option": {
			const option = options.find(
				(candidate) => candidate.optionId === decision.optionId,
			);
			return option ? option.value : decision.optionId;
		}
	}
}
