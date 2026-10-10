import type { ActivePaneStatus } from "shared/tabs-types";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Hex equivalents of the Tailwind classes `StatusIndicator` uses by default.
 * The settings color pickers start from these when no override is set.
 */
export const DEFAULT_STATUS_COLORS: Record<ActivePaneStatus, string> = {
	working: "#f59e0b",
	permission: "#eab308",
	failed: "#ef4444",
	review: "#22c55e",
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type StatusColorOverrides = Partial<Record<ActivePaneStatus, string>>;

interface StatusColorsState {
	overrides: StatusColorOverrides;
	setStatusColor: (status: ActivePaneStatus, color: string) => void;
	resetStatusColor: (status: ActivePaneStatus) => void;
	resetAllStatusColors: () => void;
}

export const useStatusColorsStore = create<StatusColorsState>()(
	devtools(
		persist(
			(set) => ({
				overrides: {},

				setStatusColor: (status, color) => {
					if (!HEX_COLOR.test(color)) return;
					set((state) => ({
						overrides: { ...state.overrides, [status]: color.toLowerCase() },
					}));
				},

				resetStatusColor: (status) => {
					set((state) => {
						if (!(status in state.overrides)) return state;
						const { [status]: _removed, ...rest } = state.overrides;
						return { overrides: rest };
					});
				},

				resetAllStatusColors: () => {
					set({ overrides: {} });
				},
			}),
			{
				name: "status-colors",
			},
		),
		{ name: "StatusColorsStore" },
	),
);

export const useStatusColorOverride = (status: ActivePaneStatus) =>
	useStatusColorsStore((state) => state.overrides[status]);
