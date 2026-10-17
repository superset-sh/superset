import { spawnSync } from "node:child_process";
import type { ServerOptions } from "@superset/pty-daemon";

/**
 * In-process PTY spawner for teardown/lifecycle tests: emits the
 * shell-integration prompt marker, then executes each written command
 * synchronously via `/bin/sh -c` and exits with its status. Mimics fish's
 * rejection of an unquoted `$?` so shell-portability regressions stay covered.
 * `ptyProxy` exits 0 whatever the command returned, as a shell re-hosted
 * under a PTY proxy (Kiro/Amazon Q) does.
 */
export function createFishLikePtySpawner(
	writes: string[],
	{ ptyProxy = false }: { ptyProxy?: boolean } = {},
): NonNullable<ServerOptions["spawnPty"]> {
	return ({ meta }) => {
		let dataCallback: ((data: Buffer) => void) | null = null;
		let exitCallback:
			| ((info: { code: number | null; signal: number | null }) => void)
			| null = null;

		queueMicrotask(() => {
			// OSC 133;A — shell-integration prompt-start marker the terminal
			// session waits for before sending the initial command.
			dataCallback?.(Buffer.from("\x1b]133;A\x07"));
		});

		return {
			pid: 42,
			meta,
			write(data) {
				const command = data.toString("utf8").trim();
				writes.push(command);
				if (withoutSingleQuoted(command).includes("$?")) {
					dataCallback?.(
						Buffer.from(
							"fish: $? is not the exit status. In fish, please use $status.\n",
						),
					);
					return;
				}

				const child = spawnSync("/bin/sh", ["-c", command], {
					cwd: meta.cwd,
					env: meta.env,
				});
				if (child.stdout.byteLength > 0) dataCallback?.(child.stdout);
				if (child.stderr.byteLength > 0) dataCallback?.(child.stderr);
				exitCallback?.({
					code: ptyProxy ? 0 : (child.status ?? 1),
					signal: null,
				});
			},
			resize(cols, rows) {
				meta.cols = cols;
				meta.rows = rows;
			},
			kill(signal) {
				exitCallback?.({ code: null, signal: signal === "SIGKILL" ? 9 : 1 });
			},
			onData(cb) {
				dataCallback = cb;
			},
			onExit(cb) {
				exitCallback = cb;
			},
			getMasterFd() {
				return 0;
			},
		};
	};
}

function withoutSingleQuoted(command: string): string {
	let unquoted = "";
	let quoted = false;
	for (let i = 0; i < command.length; i++) {
		const char = command[i];
		if (quoted) {
			if (char === "'") quoted = false;
		} else if (char === "'") {
			quoted = true;
		} else if (char === "\\") {
			i++;
		} else {
			unquoted += char;
		}
	}
	return unquoted;
}

/** POSIX single-quote escape for paths embedded in fixture scripts. */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
