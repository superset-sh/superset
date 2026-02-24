import {
	buildTerminalCommand,
	writeCommandInPane,
} from "renderer/lib/terminal/launch-command";

interface OpenWorkspaceData {
	workspace: { id: string };
	initialCommands?: string[] | null;
}

export type BootstrapOpenWorktreeError =
	| "create_or_attach_failed"
	| "write_initial_commands_failed";

interface BootstrapOpenWorktreeOptions {
	data: OpenWorkspaceData;
	addTab: (workspaceId: string) => { tabId: string; paneId: string };
	setTabAutoTitle: (tabId: string, title: string) => void;
	createOrAttach: (input: {
		paneId: string;
		tabId: string;
		workspaceId: string;
	}) => Promise<unknown>;
	writeToTerminal: (input: {
		paneId: string;
		data: string;
		throwOnError?: boolean;
	}) => Promise<unknown>;
}

export async function bootstrapOpenWorktree(
	options: BootstrapOpenWorktreeOptions,
): Promise<BootstrapOpenWorktreeError | null> {
	const setupCommand = buildTerminalCommand(options.data.initialCommands);

	const { tabId, paneId } = options.addTab(options.data.workspace.id);
	if (setupCommand) {
		options.setTabAutoTitle(tabId, "Workspace Setup");
	}

	try {
		await options.createOrAttach({
			paneId,
			tabId,
			workspaceId: options.data.workspace.id,
		});
	} catch (error) {
		console.error("[bootstrapOpenWorktree] Failed to create or attach:", error);
		return "create_or_attach_failed";
	}

	if (!setupCommand) {
		return null;
	}

	try {
		await writeCommandInPane({
			paneId,
			command: setupCommand,
			write: options.writeToTerminal,
		});
		return null;
	} catch (error) {
		console.error(
			"[bootstrapOpenWorktree] Failed to write initial commands:",
			error,
		);
		return "write_initial_commands_failed";
	}
}
