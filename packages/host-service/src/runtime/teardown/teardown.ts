import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const TEARDOWN_SCRIPT_REL_PATH = ".superset/teardown.sh";
export const TEARDOWN_TIMEOUT_MS = 60_000;
const OUTPUT_TAIL_BYTES = 4096;

export type TeardownResult =
	| { status: "ok"; output?: string }
	| { status: "skipped" }
	| {
			status: "failed";
			exitCode: number | null;
			signal: NodeJS.Signals | null;
			timedOut: boolean;
			outputTail: string;
	  };

interface RunTeardownOptions {
	worktreePath: string;
	/** Used for SUPERSET_WORKSPACE_NAME env var. Usually workspace.branch. */
	workspaceName: string;
	/** Used for SUPERSET_ROOT_PATH env var. Usually project.repoPath. */
	rootPath: string;
	timeoutMs?: number;
}

export async function runTeardown({
	worktreePath,
	workspaceName,
	rootPath,
	timeoutMs = TEARDOWN_TIMEOUT_MS,
}: RunTeardownOptions): Promise<TeardownResult> {
	const scriptPath = join(worktreePath, TEARDOWN_SCRIPT_REL_PATH);
	if (!existsSync(scriptPath)) {
		return { status: "skipped" };
	}

	return new Promise<TeardownResult>((resolve) => {
		const shell = process.env.SHELL || "/bin/bash";
		const child = spawn(shell, ["-c", `bash "${scriptPath}"`], {
			cwd: worktreePath,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				SUPERSET_WORKSPACE_NAME: workspaceName,
				SUPERSET_ROOT_PATH: rootPath,
			},
		});

		let tail = "";
		const appendTail = (chunk: Buffer) => {
			tail += chunk.toString();
			if (tail.length > OUTPUT_TAIL_BYTES) {
				tail = tail.slice(-OUTPUT_TAIL_BYTES);
			}
		};
		child.stdout?.on("data", appendTail);
		child.stderr?.on("data", appendTail);

		let settled = false;
		let timedOut = false;
		const settle = (result: TeardownResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		// "exit" — not "close". Background children can hold stdio open past exit.
		child.on("exit", (code, signal) => {
			if (code === 0 && !timedOut) {
				settle({ status: "ok", output: tail || undefined });
				return;
			}
			settle({
				status: "failed",
				exitCode: code,
				signal,
				timedOut,
				outputTail: tail,
			});
		});

		child.on("error", (err) => {
			appendTail(Buffer.from(`\n[spawn error] ${err.message}\n`));
			settle({
				status: "failed",
				exitCode: null,
				signal: null,
				timedOut: false,
				outputTail: tail,
			});
		});

		const timer = setTimeout(() => {
			timedOut = true;
			appendTail(
				Buffer.from(`\n[teardown timed out after ${timeoutMs}ms; SIGKILL]\n`),
			);
			try {
				if (child.pid) process.kill(-child.pid, "SIGKILL");
			} catch {
				// Process group may already be gone
			}
		}, timeoutMs);
		timer.unref();
	});
}
