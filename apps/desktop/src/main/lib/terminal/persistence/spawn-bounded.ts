import { spawn } from "node:child_process";

export interface SpawnWithBoundedOutputResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	timedOut: boolean;
}

function pushTailBounded(
	chunks: Buffer[],
	state: { totalBytes: number },
	chunk: Buffer,
	maxBytes: number,
): void {
	if (maxBytes <= 0) return;

	chunks.push(chunk);
	state.totalBytes += chunk.length;

	// Trim from the front until we're within maxBytes.
	while (state.totalBytes > maxBytes && chunks.length > 0) {
		const overflow = state.totalBytes - maxBytes;
		const first = chunks[0];
		if (!first) break;

		if (first.length <= overflow) {
			chunks.shift();
			state.totalBytes -= first.length;
			continue;
		}

		chunks[0] = first.subarray(overflow);
		state.totalBytes -= overflow;
		break;
	}
}

export async function spawnWithBoundedOutput(params: {
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
	timeoutMs: number;
	maxStdoutBytes: number;
	maxStderrBytes?: number;
}): Promise<SpawnWithBoundedOutputResult> {
	const { command, args, env, timeoutMs, maxStdoutBytes } = params;
	const maxStderrBytes = params.maxStderrBytes ?? 64 * 1024;

	return await new Promise<SpawnWithBoundedOutputResult>((resolve, reject) => {
		const child = spawn(command, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const stdoutChunks: Buffer[] = [];
		const stdoutState = { totalBytes: 0 };

		const stderrChunks: Buffer[] = [];
		const stderrState = { totalBytes: 0 };

		let timedOut = false;

		const timeoutId = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGKILL");
			} catch {
				try {
					child.kill();
				} catch {
					// Ignore kill errors
				}
			}
		}, timeoutMs);
		timeoutId.unref?.();

		const onStdout = (chunk: Buffer) => {
			pushTailBounded(stdoutChunks, stdoutState, chunk, maxStdoutBytes);
		};
		const onStderr = (chunk: Buffer) => {
			pushTailBounded(stderrChunks, stderrState, chunk, maxStderrBytes);
		};

		child.stdout?.on("data", onStdout);
		child.stderr?.on("data", onStderr);

		const cleanup = () => {
			clearTimeout(timeoutId);
			child.stdout?.off("data", onStdout);
			child.stderr?.off("data", onStderr);
		};

		child.once("error", (error) => {
			cleanup();
			reject(error);
		});

		child.once("close", (exitCode, signal) => {
			cleanup();
			resolve({
				stdout: Buffer.concat(stdoutChunks, stdoutState.totalBytes).toString(
					"utf8",
				),
				stderr: Buffer.concat(stderrChunks, stderrState.totalBytes).toString(
					"utf8",
				),
				exitCode,
				signal,
				timedOut,
			});
		});
	});
}
