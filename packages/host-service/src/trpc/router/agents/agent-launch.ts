import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildArgvCommand,
	quoteSingleShell,
} from "@superset/shared/agent-prompt-launch";

const DEFAULT_LAUNCH_TIMEOUT_MS = 10_000;
const LAUNCH_POLL_INTERVAL_MS = 20;

export interface PrepareAgentLaunchInput {
	command: string;
	args: string[];
	promptArgs: string[];
	promptTransport: "argv" | "stdin";
	prompt: string;
	env: Record<string, string>;
	baseDir?: string;
}

export interface PreparedAgentLaunch {
	initialCommand: string;
	launchDir: string;
	promptPath: string;
	scriptPath: string;
	ackPath: string;
	errorPath: string;
}

function buildStaticArgv(input: PrepareAgentLaunchInput): string[] {
	return [
		"env",
		...Object.entries(input.env).map(([key, value]) => `${key}=${value}`),
		input.command,
		...input.args,
		...(input.prompt === "" ? [] : input.promptArgs),
	];
}

function buildLauncherScript(
	input: PrepareAgentLaunchInput,
	paths: Omit<PreparedAgentLaunch, "initialCommand" | "launchDir">,
): string {
	const staticCommand = buildArgvCommand(buildStaticArgv(input));
	const promptPath = quoteSingleShell(paths.promptPath);
	const ackPath = quoteSingleShell(paths.ackPath);
	const errorPath = quoteSingleShell(paths.errorPath);

	let preparePrompt = "";
	let launchCommand = `${staticCommand} < /dev/tty &`;
	if (input.prompt !== "") {
		if (input.promptTransport === "argv") {
			// Command substitution normally strips trailing newlines. Appending a
			// sentinel first and removing exactly that sentinel preserves them.
			preparePrompt = `prompt_with_sentinel="$(cat ${promptPath}; printf x)"\nprompt="\${prompt_with_sentinel%x}"\n`;
			launchCommand = `${staticCommand} "$prompt" < /dev/tty &`;
		} else {
			launchCommand = `${staticCommand} < ${promptPath} &`;
		}
	}

	return `#!/bin/sh
set -u
${preparePrompt}${launchCommand}
child_pid=$!

# Let an immediate exec/argument failure settle before acknowledging launch.
sleep 0.05
if ! kill -0 "$child_pid" 2>/dev/null; then
	set +e
	wait "$child_pid"
	status=$?
	printf 'Agent process exited before launch acknowledgement (status %s).\n' "$status" > ${errorPath}
	exit "$status"
fi

printf '%s\n' "$child_pid" > ${ackPath}
set +e
wait "$child_pid"
exit $?
`;
}

/**
 * Materialize a large prompt outside the PTY input path. The user's shell only
 * receives `initialCommand`, a short quoted script path. The POSIX launcher is
 * shell-independent (including when the interactive account shell is fish),
 * starts the configured agent in the terminal's foreground process group, and
 * acknowledges only after that child survives its initial exec window.
 */
export function prepareAgentLaunch(
	input: PrepareAgentLaunchInput,
): PreparedAgentLaunch {
	const launchDir = mkdtempSync(
		join(input.baseDir ?? tmpdir(), "superset-agent-launch-"),
	);
	const promptPath = join(launchDir, "prompt.txt");
	const scriptPath = join(launchDir, "launch.sh");
	const ackPath = join(launchDir, "started");
	const errorPath = join(launchDir, "error");

	try {
		writeFileSync(promptPath, input.prompt, { encoding: "utf8", mode: 0o600 });
		const script = buildLauncherScript(input, {
			promptPath,
			scriptPath,
			ackPath,
			errorPath,
		});
		writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o700 });
		return {
			// Invoke the POSIX shell explicitly so launch also works when the
			// system temp directory is mounted noexec. This two-argument command
			// remains safe to type into fish and other interactive shells.
			initialCommand: buildArgvCommand(["/bin/sh", scriptPath]),
			launchDir,
			promptPath,
			scriptPath,
			ackPath,
			errorPath,
		};
	} catch (error) {
		rmSync(launchDir, { recursive: true, force: true });
		throw error;
	}
}

export function cleanupAgentLaunch(launch: PreparedAgentLaunch): void {
	rmSync(launch.launchDir, { recursive: true, force: true });
}

/** Run work with launch artifacts whose lifetime is scoped to the callback. */
export async function withPreparedAgentLaunch<T>(
	input: PrepareAgentLaunchInput,
	run: (launch: PreparedAgentLaunch) => Promise<T>,
): Promise<T> {
	const launch = prepareAgentLaunch(input);
	try {
		return await run(launch);
	} finally {
		cleanupAgentLaunch(launch);
	}
}

export async function waitForAgentLaunch(
	launch: PreparedAgentLaunch,
	options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ pid: number }> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() <= deadline) {
		if (options.signal?.aborted) {
			throw options.signal.reason ?? new Error("Agent launch aborted");
		}
		if (existsSync(launch.errorPath)) {
			const detail = readFileSync(launch.errorPath, "utf8").trim();
			throw new Error(detail || "Agent process failed during launch");
		}
		if (existsSync(launch.ackPath)) {
			const rawPid = readFileSync(launch.ackPath, "utf8").trim();
			const pid = Number.parseInt(rawPid, 10);
			if (!Number.isInteger(pid) || pid <= 0) {
				throw new Error(`Agent launcher returned an invalid pid: ${rawPid}`);
			}
			return { pid };
		}
		await new Promise<void>((resolve) =>
			setTimeout(resolve, LAUNCH_POLL_INTERVAL_MS),
		);
	}

	throw new Error(`Timed out after ${timeoutMs}ms waiting for agent to start`);
}
