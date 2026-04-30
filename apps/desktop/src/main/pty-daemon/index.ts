/**
 * pty-daemon — Desktop bundle target
 *
 * The supervisor (in @superset/host-service) spawns this script as the
 * daemon process. We need a desktop-side entry so electron-vite emits
 * `apps/desktop/dist/main/pty-daemon.js` alongside `host-service.js` —
 * the supervisor's `sideBySide` script-path resolution looks for the
 * daemon binary right next to its own bundle.
 *
 * The actual daemon implementation lives in `@superset/pty-daemon`.
 * This file is a thin runtime shim: argv parsing, signal handling,
 * and starting the Server. Mirrors the layout host-service uses
 * (apps/desktop/src/main/host-service/index.ts).
 *
 * Headless deploy path: in a non-Electron build, this file is unused —
 * the supervisor instead spawns the @superset/pty-daemon package's
 * built-in main.ts directly.
 */

import { Server } from "@superset/pty-daemon";

interface CliArgs {
	socket: string;
}

function parseArgs(argv: string[]): CliArgs {
	const args: Partial<CliArgs> = {};
	for (const arg of argv) {
		if (arg.startsWith("--socket=")) {
			args.socket = arg.slice("--socket=".length);
		}
	}
	if (!args.socket) {
		throw new Error("--socket=PATH is required");
	}
	return args as CliArgs;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	// Source of truth for daemon version — the supervisor sets this env
	// var on spawn (matching its EXPECTED_DAEMON_VERSION). Falls back to
	// a hardcoded default if launched without env, so the daemon still
	// reports something sane on direct invocation.
	const daemonVersion = process.env.SUPERSET_PTY_DAEMON_VERSION ?? "0.1.0";
	const server = new Server({
		socketPath: args.socket,
		daemonVersion,
	});
	await server.listen();
	process.stderr.write(
		`[pty-daemon] listening on ${args.socket} (v${daemonVersion})\n`,
	);

	let shuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals) => {
		if (shuttingDown) return;
		shuttingDown = true;
		process.stderr.write(`[pty-daemon] received ${signal}, shutting down\n`);
		try {
			await server.close();
		} catch (err) {
			process.stderr.write(
				`[pty-daemon] shutdown error: ${(err as Error).stack ?? err}\n`,
			);
		} finally {
			process.exit(0);
		}
	};
	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((error) => {
	process.stderr.write(
		`[pty-daemon] failed to start: ${(error as Error).stack ?? error}\n`,
	);
	process.exit(1);
});
