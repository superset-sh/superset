import type { HotkeyId } from "shared/hotkeys";

export interface CommandContext {
	workspaceId: string | null;
	workspaceName: string | null;
	workspaceBranch: string | null;
	projectId: string | null;
	isInWorkspace: boolean;
	isInSettings: boolean;
}

export interface Command {
	id: string;
	label: string;
	keywords?: string[];
	hotkeyId?: HotkeyId;
}

export interface CommandGroup {
	displayName: string;
	commands: Command[];
}

export type CommandGroupGenerator<T = void> = T extends void
	? (ctx: CommandContext) => CommandGroup | null
	: (ctx: CommandContext, data: T) => CommandGroup | null;
