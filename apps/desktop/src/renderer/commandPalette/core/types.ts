import type { ExternalApp } from "@superset/local-db";
import type { LucideIcon } from "lucide-react";
import type { HotkeyId } from "renderer/hotkeys/registry";

export type SectionId = "workspace" | "actions" | "navigation";

export interface CommandContext {
	route: {
		pathname: string;
		params: Record<string, string>;
	};
	workspace: {
		id: string;
		name: string;
		projectId?: string;
		workspaceType?: "main" | "worktree";
		hostId?: string;
		preferredOpenInApp?: ExternalApp;
	} | null;
	activeHostUrl: string | null;
	localMachineId: string | null;
	notificationSoundsMuted: boolean;
	navigate: (path: string) => void;
	focusedView?: "editor" | "terminal" | "git" | "issues" | "files" | "chat";
}

export interface Command {
	id: string;
	title: string;
	section: SectionId;
	icon?: LucideIcon;
	iconUrl?: string;
	keywords?: string[];
	hotkeyId?: HotkeyId;
	when?: (context: CommandContext) => boolean;
	run?: (context: CommandContext) => void | Promise<void>;
	children?: Command[] | ((context: CommandContext) => Command[]);
	renderFrame?: () => React.ReactNode;
}

export interface CommandProvider {
	id: string;
	provide: (context: CommandContext) => Command[];
}

export interface CommandSection {
	id: SectionId;
	label: string;
	commands: Command[];
}
