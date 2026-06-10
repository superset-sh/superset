import { Server } from "../src/Server/index.ts";
import { connect, connectAndHello, payloadAsString } from "./helpers/client.ts";
import {
	commandMeta,
	inputLine,
	interactiveMeta,
	makeDaemonSocketPath,
} from "./helpers/platform.ts";

const socketPath = makeDaemonSocketPath("pty-daemon-win32-smoke");
const server = new Server({
	socketPath,
	daemonVersion: "0.0.0-win32-smoke",
});

function log(message: string): void {
	process.stdout.write(`[pty-daemon smoke] ${message}\n`);
}

function timeout(ms: number, label: string): Promise<never> {
	return new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`${label} timed out`)), ms),
	);
}

async function main(): Promise<void> {
	if (process.platform !== "win32") {
		throw new Error("smoke-win32 must run on Windows");
	}

	log(`listening on ${socketPath}`);
	await server.listen();

	const handshake = await connect(socketPath);
	handshake.send({ type: "hello", protocols: [2] });
	await handshake.waitFor((m) => m.type === "hello-ack", 5_000);
	await handshake.close();
	log("handshake ok");

	const command = await connectAndHello(socketPath);
	command.send({
		type: "open",
		id: "command",
		meta: commandMeta("echo daemon-smoke"),
	});
	await command.waitFor(
		(m) => m.type === "open-ok" && m.id === "command",
		5_000,
	);
	command.send({ type: "subscribe", id: "command", replay: true });
	await command.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "command" &&
			payloadAsString(m).includes("daemon-smoke"),
		5_000,
	);
	await command.waitFor((m) => m.type === "exit" && m.id === "command", 5_000);
	await command.close();
	log("command lifecycle ok");

	const interactive = await connectAndHello(socketPath);
	interactive.send({
		type: "open",
		id: "interactive",
		meta: interactiveMeta(),
	});
	await interactive.waitFor(
		(m) => m.type === "open-ok" && m.id === "interactive",
		5_000,
	);
	interactive.send({ type: "subscribe", id: "interactive", replay: false });
	interactive.send(
		{ type: "input", id: "interactive" },
		inputLine("echo abc-marker"),
	);
	await interactive.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "interactive" &&
			payloadAsString(m).includes("abc-marker"),
		5_000,
	);
	interactive.send({ type: "resize", id: "interactive", cols: 100, rows: 30 });
	interactive.send({ type: "close", id: "interactive", signal: "SIGKILL" });
	await interactive.waitFor(
		(m) => m.type === "closed" && m.id === "interactive",
		5_000,
	);
	await interactive.close();
	log("interactive input/resize/close ok");
}

try {
	await Promise.race([main(), timeout(30_000, "smoke")]);
	process.exitCode = 0;
} catch (error) {
	process.stderr.write(
		`[pty-daemon smoke] failed: ${(error as Error).stack}\n`,
	);
	process.exitCode = 1;
} finally {
	log("cleanup start");
	await Promise.race([server.close(), timeout(2_000, "server close")]).catch(
		(error) => {
			process.stderr.write(
				`[pty-daemon smoke] cleanup failed: ${(error as Error).message}\n`,
			);
		},
	);
	log("cleanup done");
	const exitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
	(
		process as typeof process & { reallyExit?: (code?: number) => never }
	).reallyExit?.(exitCode);
	process.exit(exitCode);
}
