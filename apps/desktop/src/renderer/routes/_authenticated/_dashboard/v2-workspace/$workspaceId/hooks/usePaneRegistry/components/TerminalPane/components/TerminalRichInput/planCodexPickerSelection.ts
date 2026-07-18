/**
 * Codex has no non-interactive model command, but its /model picker is fully
 * digit-driven: every step renders a numbered list and a digit keypress
 * immediately selects that row AND advances (model step → effort step →
 * closed), no Enter needed (verified against codex-cli 0.144.5 over a PTY).
 *
 * Steps and rows, as rendered:
 * 1. "Select Model and Effort" — visible models in `debug models` order.
 * 2. "Select Reasoning Level for <model>" — levels low…xhigh as rows 1..n;
 *    models supporting max/ultra get an extra "More reasoning…" row (n+1).
 * 3. "Advanced Reasoning" submenu (only via that row) — Max=1, Ultra=2.
 *
 * "(default)"/"(current)" are row annotations, not rows, and the cursor's
 * start position is irrelevant to digit selection. The picker persists the
 * choice to ~/.codex/config.toml and the footer confirms "model effort".
 *
 * Failure safety: the only CR sent is the one submitting "/model" itself.
 * If the picker doesn't open (e.g. Codex is mid-turn), the digits land in
 * the composer as inert text — digits alone can never submit a message.
 */

/** Measured 405–524ms from CR to rendered picker across runs; 750ms margin. */
export const PICKER_OPEN_DELAY_MS = 750;
/** 150ms inter-key proven reliable across runs; 250ms adds margin. */
export const INTER_KEY_DELAY_MS = 250;

const ADVANCED_EFFORTS = new Set(["max", "ultra"]);

export interface CodexPickerModel {
	id: string;
	supportedReasoningLevels: { effort: string }[];
	defaultReasoningLevel: string;
}

export interface CodexPickerPlan {
	/** 1-based row in the picker's model step. */
	modelRow: number;
	/** 1-based row in the effort step ("More reasoning…" when submenuRow set). */
	effortRow: number;
	/** 1-based row in the Advanced Reasoning submenu, for max/ultra picks. */
	submenuRow?: number;
}

/**
 * Digit plan that lands `models[...targetModelId]` at `targetEffort`, from
 * the picker-order model list. Null when the target isn't reachable (model
 * not listed, effort unsupported) — callers must not drive blind then.
 */
export function planCodexPickerSelection(
	models: CodexPickerModel[],
	targetModelId: string,
	targetEffort: string,
): CodexPickerPlan | null {
	const modelIndex = models.findIndex((model) => model.id === targetModelId);
	const model = models[modelIndex];
	if (!model) return null;

	const levels = model.supportedReasoningLevels.map((level) => level.effort);
	const baseLevels = levels.filter((effort) => !ADVANCED_EFFORTS.has(effort));
	const advancedLevels = levels.filter((effort) =>
		ADVANCED_EFFORTS.has(effort),
	);

	const plan: CodexPickerPlan = { modelRow: modelIndex + 1, effortRow: 0 };
	if (ADVANCED_EFFORTS.has(targetEffort)) {
		const submenuIndex = advancedLevels.indexOf(targetEffort);
		if (submenuIndex === -1) return null;
		plan.effortRow = baseLevels.length + 1; // the "More reasoning…" row
		plan.submenuRow = submenuIndex + 1;
	} else {
		const effortIndex = baseLevels.indexOf(targetEffort);
		if (effortIndex === -1) return null;
		plan.effortRow = effortIndex + 1;
	}
	return plan;
}
