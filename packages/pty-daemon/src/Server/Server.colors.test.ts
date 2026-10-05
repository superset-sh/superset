import { afterEach, expect, spyOn, test } from "bun:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	accumulatedOutputAsString,
	connectAndHello,
} from "../../test/helpers/client.ts";
import type { Pty, PtyOnData, PtyOnExit } from "../Pty/index.ts";
import * as ptyModule from "../Pty/index.ts";
import type { SessionMeta } from "../protocol/index.ts";
import { Server } from "./Server.ts";

const require = createRequire(import.meta.url);
const { Terminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");

class QueryPty implements Pty {
	pid = 12345;
	meta: SessionMeta;
	writes: Buffer[] = [];
	failWrites = false;
	onOutput: PtyOnData = () => {};
	onEnd: PtyOnExit = () => {};
	constructor(meta: SessionMeta) {
		this.meta = meta;
	}
	write(bytes: Buffer) {
		if (this.failWrites) throw new Error("exited");
		this.writes.push(bytes);
	}
	onData(cb: PtyOnData) {
		this.onOutput = cb;
	}
	onExit(cb: PtyOnExit) {
		this.onEnd = cb;
	}
	resize() {}
	kill() {}
	pause() {}
	resume() {}
	dispose() {}
	getMasterFd() {
		return -1;
	}
}

let server: Server | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

test("responds before attachment, strips replay, and responds once with multiple observers", async () => {
	const socketPath = join(tmpdir(), `colors-${crypto.randomUUID()}.sock`);
	let pty: QueryPty | undefined;
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	});
	await server.listen();
	const first = await connectAndHello(socketPath);
	const second = await connectAndHello(socketPath);
	try {
		first.send({
			type: "open",
			id: "t",
			meta: {
				shell: "/bin/sh",
				argv: [],
				cols: 80,
				rows: 24,
				colors: {
					foreground: "#eeeeee",
					background: "#151110",
					cursor: "#ffffff",
				},
			},
		});
		await first.waitFor((m) => m.type === "open-ok");
		if (!pty) throw new Error("missing pty");
		const queryPty = pty;
		queryPty.onOutput(Buffer.from("before\x1b]11;?\x07after"));
		expect(queryPty.writes.map(String)).toEqual([
			"\x1b]11;rgb:1515/1111/1010\x1b\\",
		]);
		for (const client of [first, second]) {
			client.send({
				type: "subscribe",
				id: "t",
				replay: true,
				modeSnapshot: true,
			});
			await client.waitFor((m) => m.type === "replay-complete");
			expect(accumulatedOutputAsString(client, "t")).toBe(
				"before\x1b]\x07after",
			);
		}
		expect(queryPty.writes).toHaveLength(1);
		const waits = [first, second].map((client) =>
			client.waitForNext((m) => m.type === "output"),
		);
		queryPty.onOutput(Buffer.from("live\x1b]11;?\x1b\\tail"));
		await Promise.all(waits);
		expect(queryPty.writes).toHaveLength(2);
		for (const client of [first, second])
			expect(accumulatedOutputAsString(client, "t")).toBe(
				"before\x1b]\x07afterlive\x1b]\x07tail",
			);
		await second.close();
		const reattached = await connectAndHello(socketPath);
		try {
			reattached.send({
				type: "subscribe",
				id: "t",
				replay: true,
				modeSnapshot: true,
			});
			await reattached.waitFor((m) => m.type === "replay-complete");
			expect(accumulatedOutputAsString(reattached, "t")).toBe(
				"before\x1b]\x07afterlive\x1b]\x07tail",
			);
			expect(queryPty.writes).toHaveLength(2);
		} finally {
			await reattached.close();
		}
		first.send({
			type: "colors",
			id: "t",
			colors: {
				foreground: "#000000",
				background: "#ffffff",
				cursor: "#000000",
			},
		});
		first.send({ type: "list" });
		await first.waitFor((m) => m.type === "list-reply");
		queryPty.onOutput(Buffer.from("\x1b]11;?\x07"));
		expect(queryPty.writes.at(-1)?.toString()).toBe(
			"\x1b]11;rgb:ffff/ffff/ffff\x1b\\",
		);
		queryPty.failWrites = true;
		expect(() => queryPty.onOutput(Buffer.from("\x1b]11;?\x07"))).not.toThrow();
	} finally {
		await first.close();
		await second.close();
	}
});

test("delayed exit carry cannot reach a replacement session with the same id", async () => {
	const socketPath = join(tmpdir(), `stale-colors-${crypto.randomUUID()}.sock`);
	const spawned: QueryPty[] = [];
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			const pty = new QueryPty(meta);
			spawned.push(pty);
			return pty;
		},
	});
	await server.listen();
	const client = await connectAndHello(socketPath);
	const open = async () => {
		const opened = client.waitForNext((message) => message.type === "open-ok");
		client.send({
			type: "open",
			id: "reused",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await opened;
		const pty = spawned.at(-1);
		if (!pty) throw new Error("missing PTY");
		return pty;
	};
	try {
		const old = await open();
		client.send({
			type: "subscribe",
			id: "reused",
			replay: true,
			modeSnapshot: true,
		});
		await client.waitFor((message) => message.type === "replay-complete");
		old.onOutput(Buffer.from("\x1b]11;?\x1b"));
		client.send({ type: "close", id: "reused" });
		await client.waitFor((message) => message.type === "closed");
		const replacement = await open();
		old.onEnd({ code: 0, signal: null });
		replacement.onOutput(Buffer.from("replacement-output"));
		client.send({ type: "list" });
		const listed = await client.waitFor(
			(message) => message.type === "list-reply",
		);
		expect(accumulatedOutputAsString(client, "reused")).toBe(
			"replacement-output",
		);
		expect(
			client.messages.filter((message) => message.type === "exit"),
		).toHaveLength(0);
		expect(listed).toMatchObject({ sessions: [{ id: "reused", alive: true }] });
		expect(old.writes).toHaveLength(0);
		expect(replacement.writes).toHaveLength(0);
	} finally {
		await client.close();
	}
});

test("same-session exit does not publish an unfinished query for a late renderer response", async () => {
	const socketPath = join(tmpdir(), `exit-colors-${crypto.randomUUID()}.sock`);
	let pty: QueryPty | undefined;
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	});
	await server.listen();
	const client = await connectAndHello(socketPath);
	try {
		client.send({
			type: "open",
			id: "exiting",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		await client.waitFor((message) => message.type === "open-ok");
		client.send({
			type: "subscribe",
			id: "exiting",
			replay: true,
			modeSnapshot: true,
		});
		await client.waitFor((message) => message.type === "replay-complete");
		if (!pty) throw new Error("missing PTY");
		pty.onOutput(Buffer.from("final-output\x1b]11;?\x1b"));
		pty.onEnd({ code: 0, signal: null });
		await client.waitFor((message) => message.type === "exit");
		const output = accumulatedOutputAsString(client, "exiting");
		expect(output).toBe("final-output");
		expect(pty.writes).toHaveLength(0);
		for (const [bytes, expectedQueries] of [
			["\x1b]11;?\x1b", 1],
			[output, 0],
		] as const) {
			const terminal = new Terminal({ allowProposedApi: true });
			let queries = 0;
			terminal.parser.registerOscHandler(11, (data) => {
				if (data === "?") queries++;
				return true;
			});
			try {
				await new Promise<void>((resolve) => terminal.write(bytes, resolve));
				expect(queries).toBe(expectedQueries);
			} finally {
				terminal.dispose();
			}
		}
	} finally {
		await client.close();
	}
});

test("same-palette synchronization preserves overrides unless explicitly reset", async () => {
	const socketPath = join(tmpdir(), `reset-colors-${crypto.randomUUID()}.sock`);
	let pty: QueryPty | undefined;
	server = new Server({
		socketPath,
		daemonVersion: "test",
		spawnPty: ({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	});
	await server.listen();
	const client = await connectAndHello(socketPath);
	const colors = {
		foreground: "#eeeeee",
		background: "#151110",
		cursor: "#ffffff",
	};
	try {
		client.send({
			type: "open",
			id: "reset",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24, colors },
		});
		await client.waitFor((message) => message.type === "open-ok");
		if (!pty) throw new Error("missing PTY");
		pty.onOutput(Buffer.from("\x1b]11;#123456\x07"));
		for (const resetOverrides of [undefined, false, true]) {
			const barrier = client.waitForNext(
				(message) => message.type === "list-reply",
			);
			client.send({
				type: "colors",
				id: "reset",
				colors,
				...(resetOverrides === undefined ? {} : { resetOverrides }),
			});
			client.send({ type: "list" });
			await barrier;
			pty.onOutput(Buffer.from("\x1b]11;?\x07"));
			expect(pty.writes.at(-1)?.toString()).toBe(
				resetOverrides === true
					? "\x1b]11;rgb:1515/1111/1010\x1b\\"
					: "\x1b]11;rgb:1212/3434/5656\x1b\\",
			);
		}
	} finally {
		await client.close();
	}
});

test("legacy snapshot queries are sanitized without replies during adoption or repeated replay", async () => {
	const socketPath = join(tmpdir(), `lc-${crypto.randomUUID()}.sock`);
	let pty: QueryPty | undefined;
	const adopt = spyOn(ptyModule, "adoptFromFd").mockImplementation(
		({ meta }) => {
			pty = new QueryPty(meta);
			return pty;
		},
	);
	server = new Server({ socketPath, daemonVersion: "test" });
	try {
		server.adoptSnapshot({
			version: 1,
			writtenAt: Date.now(),
			sessions: [
				{
					id: "legacy",
					pid: 12345,
					fdIndex: 3,
					meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
					buffer: Buffer.from(
						"history\x1b]11;?\x07\x1b]11;#123456\x07\x1b]11;?\x1b\\tail",
					),
				},
			],
		});
		if (!pty) throw new Error("missing adopted PTY");
		expect(pty.writes).toHaveLength(0);
		await server.listen();
		for (let observer = 0; observer < 2; observer++) {
			const client = await connectAndHello(socketPath);
			try {
				client.send({
					type: "subscribe",
					id: "legacy",
					replay: true,
					modeSnapshot: true,
				});
				await client.waitFor((message) => message.type === "replay-complete");
				expect(accumulatedOutputAsString(client, "legacy")).toBe(
					"history\x1b]\x07\x1b]11;#123456\x07\x1b]\x07tail",
				);
				expect(pty.writes).toHaveLength(0);
			} finally {
				await client.close();
			}
		}
		pty.onOutput(Buffer.from("\x1b]11;?\x07"));
		expect(pty.writes.map(String)).toEqual([
			"\x1b]11;rgb:1212/3434/5656\x1b\\",
		]);
	} finally {
		adopt.mockRestore();
	}
});
