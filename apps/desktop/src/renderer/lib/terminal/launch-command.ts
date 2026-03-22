interface TerminalCreateOrAttachInput {
	paneId: string;
	tabId: string;
	workspaceId: string;
	cwd?: string;
	skipColdRestore?: boolean;
	allowKilled?: boolean;
}

interface TerminalWriteInput {
	paneId: string;
	data: string;
	throwOnError?: boolean;
}

interface WriteTerminalInputOptions {
	paneId: string;
	data: string;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	throwOnError?: boolean;
}

interface LaunchCommandInPaneOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	command: string;
	cwd?: string;
	skipColdRestore?: boolean;
	allowKilled?: boolean;
	createOrAttach: (input: TerminalCreateOrAttachInput) => Promise<unknown>;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	noExecute?: boolean;
}

function normalizeTerminalCommand(command: string): string {
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
): string | null {
	if (!Array.isArray(commands) || commands.length === 0) return null;
	return commands.join(" && ");
}

export async function writeTerminalInput({
	paneId,
	data,
	write,
	throwOnError = true,
}: WriteTerminalInputOptions): Promise<void> {
	await write({
		paneId,
		data,
		throwOnError,
	});
}

export async function writeCommandInPane({
	paneId,
	command,
	write,
	noExecute,
}: WriteCommandInPaneOptions): Promise<void> {
	await writeTerminalInput({
		paneId,
		data: noExecute ? command : normalizeTerminalCommand(command),
		write,
	});
}

export async function sendInterruptToPane({
	paneId,
	write,
	throwOnError = true,
}: {
	paneId: string;
	write: (input: TerminalWriteInput) => Promise<unknown>;
	throwOnError?: boolean;
}): Promise<void> {
	await writeTerminalInput({
		paneId,
		data: "\u0003",
		write,
		throwOnError,
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
	skipColdRestore,
	allowKilled,
	createOrAttach,
	write,
	noExecute,
}: LaunchCommandInPaneOptions): Promise<void> {
	await createOrAttach({
		paneId,
		tabId,
		workspaceId,
		...(cwd ? { cwd } : {}),
		...(skipColdRestore !== undefined ? { skipColdRestore } : {}),
		...(allowKilled !== undefined ? { allowKilled } : {}),
	});

	await writeCommandInPane({ paneId, command, write, noExecute });
}
