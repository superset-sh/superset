import { isTerminalAttachCanceledMessage } from "./attach-cancel";
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
): string | null {
	if (!Array.isArray(commands) || commands.length === 0) return null;
	return commands.join(" && ");
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

/** Attach attempts per launch, including the first. */
export const ATTACH_ATTEMPT_LIMIT = 3;

/**
 * Spaces the retries out rather than burning the budget inside one render, so
 * a component that is mid-remount has time to settle on the attach the retry
 * will ride.
 */
const ATTACH_RETRY_DELAY_MS = 25;

function isCanceledAttach(error: unknown): boolean {
	return isTerminalAttachCanceledMessage(
		error instanceof Error ? error.message : String(error),
	);
}

/**
 * Attaches the pane a command is about to be written into, retrying when the
 * attach is cancelled out from under us.
 *
 * A launch attaches with `joinPending: true`, so when the pane's `<Terminal>`
 * already has an attach in flight the launch rides on that request instead of
 * owning one (#2748). The AbortController stays with the component, though, so
 * when it unmounts or supersedes its own attach — routine while workspace init
 * brings an agent pane up mid-render — the shared request is aborted and the
 * passenger launch dies with it, even though the pane is alive and about to be
 * re-attached.
 *
 * A cancellation is therefore transient for a launch, never a verdict on the
 * pane, so we retry. Where the component cancelled on the way out, the retry
 * opens its own request and owns it. Where the component cancelled to supersede
 * itself, it has already issued the replacement synchronously, so the retry
 * joins that instead — which is just as good, since that attach is the one
 * about to succeed. What the budget buys is surviving a burst of supersedes;
 * it is not unbounded, so a pane that thrashes its attach more than
 * ATTACH_ATTEMPT_LIMIT times still fails, and now fails loudly instead of
 * silently.
 *
 * A pane that is genuinely gone rejects with TERMINAL_SESSION_KILLED instead,
 * which is not retried — only cancellations are.
 */
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
	for (let attempt = 1; ; attempt++) {
		try {
			await createOrAttach({
				paneId,
				tabId,
				workspaceId,
				cwd,
				joinPending: true,
			});
			return;
		} catch (error) {
			if (attempt >= ATTACH_ATTEMPT_LIMIT || !isCanceledAttach(error)) {
				throw error;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, ATTACH_RETRY_DELAY_MS),
			);
		}
	}
}
