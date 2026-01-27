import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@superset/ui/command";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { HotkeyId } from "shared/hotkeys";
import {
	actionsCommands,
	contextualCommands,
	navigationCommands,
	type WorkspaceItem,
	workspacesCommands,
} from "./generators";
import { useCommandActions } from "./hooks/useCommandActions";
import { useCommandContext } from "./hooks/useCommandContext";
import type { Command, CommandGroup as CommandGroupType } from "./types";

interface CommandMenuProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

function HotkeyShortcut({ hotkeyId }: { hotkeyId: HotkeyId }) {
	const hotkeyText = useHotkeyText(hotkeyId);
	if (hotkeyText === "Unassigned") return null;
	return <CommandShortcut>{hotkeyText}</CommandShortcut>;
}

function CommandItemContent({ command }: { command: Command }) {
	return (
		<>
			<span>{command.label}</span>
			{command.hotkeyId && <HotkeyShortcut hotkeyId={command.hotkeyId} />}
		</>
	);
}

export function CommandMenu({ isOpen, onOpenChange }: CommandMenuProps) {
	const ctx = useCommandContext();
	const { executeCommand } = useCommandActions(ctx, () => onOpenChange(false));

	// Fetch workspaces for the workspace list
	const { data: workspaceGroups } =
		electronTrpc.workspaces.getAllGrouped.useQuery();
	const allWorkspaces: WorkspaceItem[] =
		workspaceGroups?.flatMap((g) =>
			g.workspaces.map((ws) => ({
				id: ws.id,
				name: ws.name,
				branch: ws.branch,
			})),
		) ?? [];

	// Generate all command groups
	const groups: CommandGroupType[] = [
		contextualCommands(ctx),
		workspacesCommands(ctx, allWorkspaces),
		actionsCommands(ctx),
		navigationCommands(ctx),
	].filter((g): g is CommandGroupType => g !== null);

	const handleSelect = (commandId: string) => {
		executeCommand(commandId);
	};

	return (
		<CommandDialog
			open={isOpen}
			onOpenChange={onOpenChange}
			title="Command Menu"
			description="Search for commands and workspaces"
			showCloseButton={false}
		>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				{groups.map((group) => (
					<CommandGroup key={group.displayName} heading={group.displayName}>
						{group.commands.map((command) => (
							<CommandItem
								key={command.id}
								value={command.id}
								keywords={command.keywords}
								onSelect={handleSelect}
							>
								<CommandItemContent command={command} />
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}
