import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { connectAndHello } from "../../test/helpers/client.ts";
import type { Pty, PtyOnExit, SpawnOptions } from "../Pty/index.ts";
import type { SessionMeta } from "../protocol/index.ts";
import { Server } from "./Server.ts";

// Reproduction for #5305: the pty-daemon leaks the PTY master fd when an
// agent/terminal session exits. The daemon deletes the session row on exit
// but never releases the kernel master fd, so over a long uptime with high
// agent churn the leaked fds accumulate until the host hits the system
// pty cap and no new agent (or terminal app) can spawn.
//
// These tests drive a real Server over a Unix socket with a fake PTY that
// holds a real file descriptor as a stand-in for the kernel master fd, so
// the leak is observable on the filesystem (fstat the fd after exit).

let nextPid = 5000;

/**
 * Fake PTY backed by a real fd (an open handle on /dev/null). The fd stands
 * in for the kernel PTY master fd. `dispose()` is the only thing that closes
 * it — exactly the release the daemon must perform on session teardown.
 */
class FakePty implements Pty {
	readonly pid: number;
	meta: SessionMeta;
	private readonly fd: number;
	private readonly exitCbs: PtyOnExit[] = [];
	private disposed = false;

	constructor(meta: SessionMeta) {
		this.meta = meta;
		this.pid = nextPid++;
		this.fd = fs.openSync("/dev/null", "r");
	}

	getMasterFd(): number {
		return this.fd;
	}

	write(): void {}
	resize(cols: number, rows: number): void {
		this.meta = { ...this.meta, cols, rows };
	}
	kill(): void {}
	onData(): void {}
	onExit(cb: PtyOnExit): void {
		this.exitCbs.push(cb);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		fs.closeSync(this.fd);
	}

	/** Test hook: simulate the underlying agent process exiting. */
	fireExit(): void {
		for (const cb of this.exitCbs) cb({ code: 0, signal: null });
	}
}

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch {
		return false;
	}
}

let server: Server | null = null;

afterEach(async () => {
	if (server) {
		await server.close();
		server = null;
	}
});

describe("pty-daemon master-fd lifecycle (#5305)", () => {
	test("releases the PTY master fd when a session exits", async () => {
		const spawned: FakePty[] = [];
		const socketPath = path.join(
			os.tmpdir(),
			`pty-fd-leak-${process.pid}-${nextPid}.sock`,
		);
		server = new Server({
			socketPath,
			daemonVersion: "test",
			spawnPty: (opts: SpawnOptions) => {
				const pty = new FakePty(opts.meta);
				spawned.push(pty);
				return pty;
			},
		});
		await server.listen();

		const client = await connectAndHello(socketPath);
		client.send({
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((m) => m.type === "open-ok");

		const pty = spawned[0];
		if (!pty) throw new Error("no pty spawned");
		const fd = pty.getMasterFd();
		expect(fdIsOpen(fd)).toBe(true);

		// The agent process exits. fireExit() synchronously runs the daemon's
		// in-process exit handler, so the cleanup (if any) has already happened
		// by the time it returns.
		pty.fireExit();

		// The daemon must release the master fd. Before the fix it stayed open
		// forever — this is the leak that exhausts kern.tty.ptmx_max.
		expect(fdIsOpen(fd)).toBe(false);

		await client.close();
	});

	test("does not leak master fds across many session churn cycles", async () => {
		const spawned: FakePty[] = [];
		const socketPath = path.join(
			os.tmpdir(),
			`pty-fd-leak-churn-${process.pid}-${nextPid}.sock`,
		);
		server = new Server({
			socketPath,
			daemonVersion: "test",
			spawnPty: (opts: SpawnOptions) => {
				const pty = new FakePty(opts.meta);
				spawned.push(pty);
				return pty;
			},
		});
		await server.listen();

		const client = await connectAndHello(socketPath);
		const fds: number[] = [];
		for (let i = 0; i < 25; i++) {
			const id = `s${i}`;
			client.send({
				type: "open",
				id,
				meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
			});
			await client.waitForNext((m) => m.type === "open-ok" && m.id === id);
			const pty = spawned[i];
			if (!pty) throw new Error(`no pty spawned for ${id}`);
			fds.push(pty.getMasterFd());
			pty.fireExit();
		}

		// Every fd from every exited session must be closed.
		const stillOpen = fds.filter(fdIsOpen);
		expect(stillOpen).toHaveLength(0);

		await client.close();
	});
});
