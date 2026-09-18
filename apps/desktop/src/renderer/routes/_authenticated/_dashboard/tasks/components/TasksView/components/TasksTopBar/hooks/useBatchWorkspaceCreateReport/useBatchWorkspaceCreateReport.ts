import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";
import { summarizeBatchWorkspaceCreates } from "./summarizeBatchWorkspaceCreates";

/**
 * The failure line a batch create shows, or null when every workspace was
 * created with its agent running. Reports the two failure kinds separately:
 * an agent that never launched left a usable workspace behind, and calling
 * that a create failure sends the user looking for a workspace that exists.
 */
export function useBatchWorkspaceCreateReport() {
	const { t } = useLingui();
	return useCallback(
		(outcomes: readonly SubmitOutcome[]): string | null => {
			const failures = summarizeBatchWorkspaceCreates(outcomes);
			if (failures === null) return null;
			const lines: string[] = [];
			if (failures.notCreated > 0) {
				const error = failures.firstNotCreatedError ?? "";
				lines.push(
					t({
						message: plural(failures.notCreated, {
							one: `Couldn't create # workspace: ${error}`,
							other: `Couldn't create # workspaces: ${error}`,
						}),
					}),
				);
			}
			if (failures.agentFailed > 0) {
				const error = failures.firstAgentError ?? "";
				lines.push(
					t({
						message: plural(failures.agentFailed, {
							// The count is the failing subset, not the batch: naming
							// what was created would read as the batch's total.
							one: `The agent didn't start in # workspace: ${error}`,
							other: `The agents didn't start in # workspaces: ${error}`,
						}),
					}),
				);
			}
			// Every line ends with a raw host error, which carries no
			// punctuation of its own, so a bare space runs the two sentences
			// together: "...is not running The agents didn't start...". Close
			// each line another one follows; the last stays as it reads alone.
			return lines
				.map((line, index) =>
					index === lines.length - 1 || /[.!?]$/.test(line) ? line : `${line}.`,
				)
				.join(" ");
		},
		[t],
	);
}
