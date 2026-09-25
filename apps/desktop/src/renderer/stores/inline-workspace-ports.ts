import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: where workspace ports render.
 *
 * This store is the single source of truth for the ports-layout experiment —
 * read it everywhere via {@link usePortsDisplayMode} (or the narrower
 * {@link useInlineWorkspacePortsEnabled}).
 *
 * - "inline": ports render as a chip under each workspace item.
 * - "topbar": ports render as a dropdown from the top bar (and the workspace
 *   tab bar, which replaces the top bar on the v2 workspace route); the
 *   sidebar shows no ports at all.
 *
 * A third mode, "panel" (a consolidated list at the bottom of the sidebar),
 * was tried and removed — `migrate` below folds any persisted "panel" value
 * into "topbar", its closest surviving equivalent.
 *
 * To conclude the experiment, pick the winning layout and remove the other:
 *   1. This store + `usePortsDisplayMode` + `useInlineWorkspacePortsEnabled`.
 *   2. The mode select in `ExperimentalSettings` and its `settings-search`
 *      entry (`EXPERIMENTAL_INLINE_WORKSPACE_PORTS`).
 *   3. The mode branches in `DashboardSidebarWorkspaceChips` (the inline
 *      ports chip), `TopBar`, and the v2 workspace page's tab-bar trailing
 *      slot (`TopBarPortsDropdown`), plus the ports-provider gating in the
 *      dashboard layout.
 *   4. The components belonging to the losing layout:
 *      - inline: `DashboardSidebarPortsChip` (under
 *        `DashboardSidebarWorkspaceChips`).
 *      - topbar: `TopBarPortsDropdown` (under `TopBar/components`).
 *
 * Both layouts read port data from the single `DashboardSidebarPortsProvider`
 * mounted in the dashboard layout.
 */
export type PortsDisplayMode = "inline" | "topbar";

interface InlineWorkspacePortsState {
	mode: PortsDisplayMode;
	setMode: (mode: PortsDisplayMode) => void;
}

export const useInlineWorkspacePortsStore = create<InlineWorkspacePortsState>()(
	devtools(
		persist(
			(set) => ({
				mode: "inline",
				setMode: (mode) => set({ mode }),
			}),
			{
				name: "inline-workspace-ports",
				version: 2,
				// v0 persisted `{ enabled: boolean }` for the original inline-vs-panel
				// A/B; v1 added a `{ mode }` string including the now-removed "panel".
				migrate: (persisted, version) => {
					if (version === 0 && persisted && typeof persisted === "object") {
						const { enabled } = persisted as { enabled?: boolean };
						return { mode: enabled === false ? "topbar" : "inline" };
					}
					if (version === 1 && persisted && typeof persisted === "object") {
						const { mode } = persisted as { mode?: string };
						if (mode === "inline" || mode === "topbar") {
							return { mode };
						}
						// "panel" or anything unrecognized.
						return { mode: "topbar" };
					}
					return persisted as InlineWorkspacePortsState;
				},
			},
		),
		{ name: "InlineWorkspacePortsStore" },
	),
);

/** Single read path for the ports-layout experiment. */
export function usePortsDisplayMode(): PortsDisplayMode {
	return useInlineWorkspacePortsStore((state) => state.mode);
}

/** True when ports render inline under each workspace item. */
export function useInlineWorkspacePortsEnabled(): boolean {
	return useInlineWorkspacePortsStore((state) => state.mode === "inline");
}
