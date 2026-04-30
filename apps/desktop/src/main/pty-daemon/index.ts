/**
 * pty-daemon — Desktop Entry Point
 *
 * Long-lived process that owns all PTY sessions. host-service is a client
 * over a Unix socket. The PtyDaemonCoordinator (sibling of
 * HostServiceCoordinator) spawns this and passes --socket=PATH.
 *
 * Mirrors the host-service entry shape: imports from the workspace package
 * and provides the bare runtime glue (argv parsing, signal handling).
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
	const daemonVersion = process.env.SUPERSET_PTY_DAEMON_VERSION ?? "0.1.0";
	const server = new Server({
		socketPath: args.socket,
		daemonVersion,
	});
	await server.listen();
	process.stderr.write(
		`[pty-daemon] listening on ${args.socket} (v${daemonVersion})\n`,
	);

	const shutdown = async (signal: NodeJS.Signals) => {
		process.stderr.write(`[pty-daemon] received ${signal}, shutting down\n`);
		await server.close();
		process.exit(0);
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
