import { buildShellCommandChain } from "@superset/shared/shell";
import { waitForTerminalSessionReady } from "./session-readiness";

interface TerminalCreateOrAttachInput {
	paneId: string;
	tabId: string;
	workspaceId: string;
	cwd?: string;
	joinPending?: boolean;
}

interface TerminalWriteInput {
	paneId: string;
	data: string;
	throwOnError?: boolean;
}

interface TerminalWriteCommandsInput {
	paneId: string;
	commands: string[];
	cwd?: string;
	throwOnError?: boolean;
}

interface LaunchCommandInPaneOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	command: string;
	cwd?: string;
	createOrAttach: (input: TerminalCreateOrAttachInput) => Promise<unknown>;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	noExecute?: boolean;
	/**
	 * Only use this for panes that will mount immediately in the active tab.
	 * Background tabs must use the helper-side attach path instead.
	 */
	waitForMountedSession?: boolean;
}

interface LaunchCommandsInPaneOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	commands: string[];
	cwd?: string;
	createOrAttach: (input: TerminalCreateOrAttachInput) => Promise<unknown>;
	writeCommands: (input: TerminalWriteCommandsInput) => Promise<unknown>;
	/**
	 * Only use this for panes that will mount immediately in the active tab.
	 * Background tabs must use the helper-side attach path instead.
	 */
	waitForMountedSession?: boolean;
}

export function normalizeTerminalCommand(command: string): string {
	return command.endsWith("\n") ? command : `${command}\n`;
}

interface WriteCommandInPaneOptions {
	paneId: string;
	command: string;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	noExecute?: boolean;
}

interface WriteCommandsInPaneOptions {
	paneId: string;
	commands: string[] | null | undefined;
	write: (input: TerminalWriteInput) => Promise<unknown>;
}

export function buildTerminalCommand(
	commands: string[] | null | undefined,
	options?: { shell?: string | null; platform?: string },
): string | null {
	if (!Array.isArray(commands) || commands.length === 0) return null;
	return buildShellCommandChain(commands, options);
}

export async function writeCommandInPane({
	paneId,
	command,
	write,
	noExecute,
}: WriteCommandInPaneOptions): Promise<void> {
	const data = noExecute ? command : normalizeTerminalCommand(command);
	await write({
		paneId,
		data,
		throwOnError: true,
	});
}

export async function writeCommandsInPane({
	paneId,
	commands,
	write,
}: WriteCommandsInPaneOptions): Promise<void> {
	const command = buildTerminalCommand(commands);
	if (!command) return;
	await writeCommandInPane({ paneId, command, write });
}

export async function launchCommandInPane({
	paneId,
	tabId,
	workspaceId,
	command,
	cwd,
	createOrAttach,
	write,
	noExecute,
	waitForMountedSession,
}: LaunchCommandInPaneOptions): Promise<void> {
	if (waitForMountedSession) {
		await waitForTerminalSessionReady(paneId);
		await writeCommandInPane({ paneId, command, write, noExecute });
		return;
	}

	await ensureTerminalAttached({
		paneId,
		tabId,
		workspaceId,
		cwd,
		createOrAttach,
	});

	await writeCommandInPane({ paneId, command, write, noExecute });
}

export async function launchCommandsInPane({
	paneId,
	tabId,
	workspaceId,
	commands,
	cwd,
	createOrAttach,
	writeCommands,
	waitForMountedSession,
}: LaunchCommandsInPaneOptions): Promise<void> {
	const runnableCommands = commands.filter(
		(command) => command.trim().length > 0,
	);
	if (runnableCommands.length === 0) return;

	if (waitForMountedSession) {
		await waitForTerminalSessionReady(paneId);
		await writeCommands({
			paneId,
			commands: runnableCommands,
			cwd,
			throwOnError: true,
		});
		return;
	}

	await ensureTerminalAttached({
		paneId,
		tabId,
		workspaceId,
		cwd,
		createOrAttach,
	});

	await writeCommands({
		paneId,
		commands: runnableCommands,
		throwOnError: true,
	});
}

export async function ensureTerminalAttached({
	paneId,
	tabId,
	workspaceId,
	cwd,
	createOrAttach,
}: {
	paneId: string;
	tabId: string;
	workspaceId: string;
	cwd?: string;
	createOrAttach: (input: TerminalCreateOrAttachInput) => Promise<unknown>;
}): Promise<void> {
	await createOrAttach({
		paneId,
		tabId,
		workspaceId,
		cwd,
		joinPending: true,
	});
}
