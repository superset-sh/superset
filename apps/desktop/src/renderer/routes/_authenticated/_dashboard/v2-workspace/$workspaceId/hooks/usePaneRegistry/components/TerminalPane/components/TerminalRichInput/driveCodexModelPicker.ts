import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import {
	type CodexPickerPlan,
	INTER_KEY_DELAY_MS,
	PICKER_OPEN_DELAY_MS,
} from "./planCodexPickerSelection";
import { typeCommandIntoPty } from "./typeCommandIntoPty";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Open Codex's /model picker in the PTY and drive it through `plan`. */
export async function driveCodexModelPicker(
	terminalId: string,
	plan: CodexPickerPlan,
	terminalInstanceId?: string,
): Promise<void> {
	const rows = [plan.modelRow, plan.effortRow];
	if (plan.submenuRow !== undefined) rows.push(plan.submenuRow);
	// Single keypresses only — a two-digit row could half-select the wrong one.
	if (rows.some((row) => row < 1 || row > 9)) return;

	await typeCommandIntoPty(terminalId, "/model", terminalInstanceId);
	await sleep(PICKER_OPEN_DELAY_MS);
	for (const row of rows) {
		terminalRuntimeRegistry.writeInput(
			terminalId,
			String(row),
			terminalInstanceId,
		);
		await sleep(INTER_KEY_DELAY_MS);
	}
}
