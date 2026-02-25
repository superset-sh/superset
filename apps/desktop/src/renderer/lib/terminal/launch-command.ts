interface TerminalCreateOrAttachInput {
	paneId: string;
	tabId: string;
	workspaceId: string;
}

interface TerminalWriteInput {
	paneId: string;
	data: string;
	throwOnError?: boolean;
}

interface LaunchCommandInPaneOptions {
	paneId: string;
	tabId: string;
	workspaceId: string;
	command: string;
	createOrAttach: (input: TerminalCreateOrAttachInput) => Promise<unknown>;
	write: (input: TerminalWriteInput) => Promise<unknown>;
}

function normalizeTerminalCommand(command: string): string {
	return command.endsWith("\n") ? command : `${command}\n`;
}

interface WriteCommandInPaneOptions {
	paneId: string;
	command: string;
	write: (input: TerminalWriteInput) => Promise<unknown>;
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

export async function writeCommandInPane({
	paneId,
	command,
	write,
}: WriteCommandInPaneOptions): Promise<void> {
	await write({
		paneId,
		data: normalizeTerminalCommand(command),
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
	createOrAttach,
	write,
}: LaunchCommandInPaneOptions): Promise<void> {
	await createOrAttach({
		paneId,
		tabId,
		workspaceId,
	});

	await writeCommandInPane({ paneId, command, write });
}
