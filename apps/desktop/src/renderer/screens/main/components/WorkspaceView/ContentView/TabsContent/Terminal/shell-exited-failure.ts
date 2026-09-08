export interface ShellExitedFailure {
	message: string;
	exitCode: number;
	signal?: number;
	outputHead: string;
}

/**
 * createOrAttach rejected because the shell process exited before it was
 * ready (PRECONDITION_FAILED with a SHELL_EXITED cause from the terminal
 * router). The pane shows it like any other process exit instead of
 * treating it as a lost connection to retry.
 */
export function getShellExitedFailure(
	error: unknown,
): ShellExitedFailure | null {
	if (!error || typeof error !== "object") return null;
	const { message, data } = error as { message?: unknown; data?: unknown };
	const cause = (data as { cause?: unknown } | undefined)?.cause;
	if (!cause || typeof cause !== "object") return null;
	const { kind, exitCode, signal, outputHead } = cause as {
		kind?: unknown;
		exitCode?: unknown;
		signal?: unknown;
		outputHead?: unknown;
	};
	if (
		kind !== "SHELL_EXITED" ||
		typeof exitCode !== "number" ||
		typeof outputHead !== "string"
	) {
		return null;
	}
	return {
		message: typeof message === "string" ? message : "",
		exitCode,
		signal: typeof signal === "number" ? signal : undefined,
		outputHead,
	};
}
