import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const MAX_PINNED_SIDEBAR_COMMANDS = 8;

interface PinnedSidebarCommandsState {
	commandIds: string[];
	togglePinned: (commandId: string) => void;
	unpin: (commandId: string) => void;
}

export const usePinnedSidebarCommandsStore =
	create<PinnedSidebarCommandsState>()(
		devtools(
			persist(
				(set) => ({
					commandIds: [],
					togglePinned: (commandId) =>
						set((state) => {
							if (state.commandIds.includes(commandId)) {
								return {
									commandIds: state.commandIds.filter((id) => id !== commandId),
								};
							}
							// Oldest pins fall off at the cap, which also retires ids of
							// commands that no longer exist and so can't be unpinned by hand.
							return {
								commandIds: [...state.commandIds, commandId].slice(
									-MAX_PINNED_SIDEBAR_COMMANDS,
								),
							};
						}),
					unpin: (commandId) =>
						set((state) => ({
							commandIds: state.commandIds.filter((id) => id !== commandId),
						})),
				}),
				{ name: "pinned-sidebar-commands-v1" },
			),
			{ name: "PinnedSidebarCommands" },
		),
	);
