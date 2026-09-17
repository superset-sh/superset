import { useMemo } from "react";
import {
	type Command,
	findCommandById,
	useActiveCommands,
	useCommandContext,
} from "renderer/commandPalette";
import { usePinnedSidebarCommandsStore } from "renderer/stores/pinned-sidebar-commands";

/**
 * Pins are stored as ids and resolved against the live palette, so a pinned
 * command that doesn't apply right now (a workspace action outside a
 * workspace) is absent here rather than shown dead.
 */
export function usePinnedSidebarCommands(): Command[] {
	const context = useCommandContext();
	const sections = useActiveCommands(context);
	const commandIds = usePinnedSidebarCommandsStore((state) => state.commandIds);

	return useMemo(
		() =>
			commandIds.flatMap((commandId) => {
				const command = findCommandById(sections, commandId, context);
				return command ? [command] : [];
			}),
		[commandIds, sections, context],
	);
}
