/**
 * Pure helpers for accumulating answers to a multi-select `ask_user` question.
 *
 * A multi-select question must let the user pick several options before
 * submitting. These helpers keep that toggle/format logic isolated from the
 * component so it stays trivial to test (see PendingQuestionMessage.test.tsx).
 */

/** Add `label` if absent, remove it if already selected. Order-preserving. */
export function toggleSelection(
	selected: readonly string[],
	label: string,
): string[] {
	return selected.includes(label)
		? selected.filter((existing) => existing !== label)
		: [...selected, label];
}

/** Render the selected labels as the single answer string sent to the agent. */
export function formatSelectedAnswer(selected: readonly string[]): string {
	return selected.join(", ");
}
