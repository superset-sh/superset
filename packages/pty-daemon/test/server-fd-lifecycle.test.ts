import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Pty, PtyOnExit, SpawnOptions } from "../src/Pty/index.ts";
import type { SessionMeta } from "../src/protocol/index.ts";
import { Server } from "../src/Server/Server.ts";
import { connectAndHello } from "./helpers/client.ts";

let nextPid = 50_000;
let server: Server | null = null;

class FdBackedPty implements Pty {
	readonly pid = nextPid++;
	meta: SessionMeta;
	readonly fd = fs.openSync("/dev/null", "r");
	disposeCalls = 0;
	killSignals: NodeJS.Signals[] = [];
	private disposed = false;
	private readonly exitCallbacks: PtyOnExit[] = [];

	constructor(meta: SessionMeta) {
		this.meta = meta;
	}

	write(): void {}
	resize(cols: number, rows: number): void {
		this.meta = { ...this.meta, cols, rows };
	}
	kill(signal: NodeJS.Signals = "SIGHUP"): void {
		this.killSignals.push(signal);
	}
	onData(): void {}
	onExit(cb: PtyOnExit): void {
		this.exitCallbacks.push(cb);
	}
	pause(): void {}
	resume(): void {}
	getMasterFd(): number {
		return this.fd;
	}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.disposeCalls++;
		fs.closeSync(this.fd);
	}
	fireExit(): void {
		for (const cb of this.exitCallbacks) cb({ code: 0, signal: null });
	}
}

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EBADF") return false;
		throw err;
	}
}

function socketPath(label: string): string {
	return path.join(
		os.tmpdir(),
		`pty-daemon-${label}-${process.pid}-${nextPid}.sock`,
	);
}

async function listenWithFds(
	label: string,
): Promise<{ socket: string; spawned: FdBackedPty[] }> {
	const socket = socketPath(label);
	const spawned: FdBackedPty[] = [];
	server = new Server({
		socketPath: socket,
		daemonVersion: "test",
		spawnPty: ({ meta }: SpawnOptions) => {
			const pty = new FdBackedPty(meta);
			spawned.push(pty);
			return pty;
		},
	});
	await server.listen();
	return { socket, spawned };
}

afterEach(async () => {
	if (server) await server.close();
	server = null;
});

describe("PTY master-fd ownership", () => {
	test("natural exits do not leak real fds across high churn", async () => {
		const { socket, spawned } = await listenWithFds("natural-churn");
		const client = await connectAndHello(socket);
		try {
			for (let i = 0; i < 128; i++) {
				const id = `churn-${i}`;
				const opened = client.waitForNext(
					(m) => m.type === "open-ok" && m.id === id,
				);
				client.send({
					type: "open",
					id,
					meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
				});
				await opened;
				const pty = spawned[i];
				if (!pty) throw new Error(`missing PTY ${i}`);
				expect(fdIsOpen(pty.fd)).toBe(true);
				pty.fireExit();
				expect(fdIsOpen(pty.fd)).toBe(false);
				pty.dispose();
				expect(pty.disposeCalls).toBe(1);
			}
		} finally {
			await client.close();
		}
	});

	test("explicit close signals before disposing the master fd", async () => {
		const { socket, spawned } = await listenWithFds("explicit-close");
		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "close-me",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor((m) => m.type === "open-ok" && m.id === "close-me");
			const pty = spawned[0];
			if (!pty) throw new Error("missing PTY");
			client.send({ type: "close", id: "close-me" });
			await client.waitFor((m) => m.type === "closed" && m.id === "close-me");
			expect(pty.killSignals).toEqual(["SIGHUP"]);
			expect(fdIsOpen(pty.fd)).toBe(false);
			pty.fireExit();
		} finally {
			await client.close();
		}
	});

	test("a stale exit cannot delete a replacement with the same id", async () => {
		const { socket, spawned } = await listenWithFds("recycled-id");
		const client = await connectAndHello(socket);
		try {
			client.send({
				type: "open",
				id: "recycled",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitFor((m) => m.type === "open-ok" && m.id === "recycled");
			const original = spawned[0];
			if (!original) throw new Error("missing original PTY");

			client.send({ type: "close", id: "recycled" });
			await client.waitFor((m) => m.type === "closed" && m.id === "recycled");

			const replacementOpened = client.waitForNext(
				(m) => m.type === "open-ok" && m.id === "recycled",
			);
			client.send({
				type: "open",
				id: "recycled",
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await replacementOpened;
			const replacement = spawned[1];
			if (!replacement) throw new Error("missing replacement PTY");

			original.fireExit();
			const listed = client.waitForNext((m) => m.type === "list-reply");
			client.send({ type: "list" });
			const reply = await listed;
			expect(reply.type).toBe("list-reply");
			if (reply.type === "list-reply") {
				expect(reply.sessions).toEqual([
					expect.objectContaining({
						id: "recycled",
						pid: replacement.pid,
						alive: true,
					}),
				]);
			}
			expect(fdIsOpen(replacement.fd)).toBe(true);
		} finally {
			await client.close();
		}
	});

	test("normal daemon shutdown disposes every owned master fd", async () => {
		const { socket, spawned } = await listenWithFds("shutdown");
		const client = await connectAndHello(socket);
		client.send({
			type: "open",
			id: "shutdown-me",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok" && m.id === "shutdown-me");
		const pty = spawned[0];
		if (!pty) throw new Error("missing PTY");
		await server?.close();
		server = null;
		expect(pty.killSignals).toEqual(["SIGKILL"]);
		expect(fdIsOpen(pty.fd)).toBe(false);
	});

	test("successful handoff close leaves predecessor descriptors untouched", async () => {
		const { socket, spawned } = await listenWithFds("handoff");
		const client = await connectAndHello(socket);
		client.send({
			type: "open",
			id: "handoff-me",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok" && m.id === "handoff-me");
		const pty = spawned[0];
		if (!pty) throw new Error("missing PTY");
		await server?.close({ killSessions: false });
		server = null;
		expect(pty.killSignals).toEqual([]);
		expect(pty.disposeCalls).toBe(0);
		expect(fdIsOpen(pty.fd)).toBe(true);
		pty.dispose();
	});
});
