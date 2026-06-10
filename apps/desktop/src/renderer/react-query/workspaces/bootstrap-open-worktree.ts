import { ensureTerminalAttached } from "renderer/lib/terminal/launch-command";

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
		joinPending?: boolean;
	}) => Promise<unknown>;
	writeCommandsToTerminal: (input: {
		paneId: string;
		commands: string[];
		throwOnError?: boolean;
	}) => Promise<unknown>;
}

export async function bootstrapOpenWorktree(
	options: BootstrapOpenWorktreeOptions,
): Promise<BootstrapOpenWorktreeError | null> {
	const setupCommands = options.data.initialCommands?.filter((command) =>
		command.trim(),
	);

	const { tabId, paneId } = options.addTab(options.data.workspace.id);
	if (setupCommands?.length) {
		options.setTabAutoTitle(tabId, "Workspace Setup");
	}

	try {
		await ensureTerminalAttached({
			paneId,
			tabId,
			workspaceId: options.data.workspace.id,
			createOrAttach: options.createOrAttach,
		});
	} catch (error) {
		console.error("[bootstrapOpenWorktree] Failed to create or attach:", error);
		return "create_or_attach_failed";
	}

	if (!setupCommands?.length) {
		return null;
	}

	try {
		await options.writeCommandsToTerminal({
			paneId,
			commands: setupCommands,
			throwOnError: true,
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
