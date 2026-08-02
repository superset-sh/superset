import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Whether a Claude Code terminal's own `/rename`/`/color` should be
 * reflected as the tab's title and background tint. On by default; single
 * source of truth read everywhere via {@link useClaudeTabDecorationEnabled}.
 */
interface ClaudeTabDecorationState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useClaudeTabDecorationStore = create<ClaudeTabDecorationState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "claude-tab-decoration" },
		),
		{ name: "ClaudeTabDecorationStore" },
	),
);

/** Single read path for the Claude tab name/color decoration setting. */
export function useClaudeTabDecorationEnabled(): boolean {
	return useClaudeTabDecorationStore((state) => state.enabled);
}
