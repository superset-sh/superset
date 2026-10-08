import type { ApprovalRequest } from "@superset/chat/protocol";

export type ApprovalOption = NonNullable<ApprovalRequest["options"]>[number];

/** `allow` is a grant whose scope the agent left unsaid. */
export type OptionRole = "reject" | "allow_always" | "allow_once" | "allow";

/**
 * Agents name their options freely; the ACP kind says what each one does,
 * and the id and label stand in for it when the agent sent none. A label
 * that says nothing about scope is not taken for the narrow grant.
 */
export function optionRole(option: ApprovalOption): OptionRole {
	switch (option.kind) {
		case "reject_once":
		case "reject_always":
			return "reject";
		case "allow_once":
		case "allow_always":
			return option.kind;
		case undefined:
			break;
	}
	const text = `${option.optionId} ${option.label}`;
	if (/reject|deny|decline|refuse|\bno\b/i.test(text)) return "reject";
	if (/session|always|\ball\b|forever|permanent/i.test(text)) {
		return "allow_always";
	}
	if (/once|this time|\bone\b/i.test(text)) return "allow_once";
	return "allow";
}
