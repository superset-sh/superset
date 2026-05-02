import { beforeEach, describe, expect, test } from "bun:test";
import type { Pty, SpawnOptions } from "../Pty/index.ts";
import type { ServerMessage } from "../protocol/index.ts";
import { SessionStore } from "../SessionStore/index.ts";
import type { Conn, HandlerCtx } from "./handlers.ts";
import {
	handleClose,
	handleInput,
	handleList,
	handleOpen,
	handleResize,
	handleSubscribe,
	handleUnsubscribe,
} from "./handlers.ts";

interface FakePtyState {
	pid: number;
	cols: number;
	rows: number;
	written: Buffer[];
	killed: boolean;
}

function makeFakePty(state: FakePtyState, meta: SpawnOptions["meta"]): Pty {
	state.cols = meta.cols;
	state.rows = meta.rows;
	return {
		pid: state.pid,
		meta,
		write: (b) => state.written.push(b),
		resize: (c, r) => {
			state.cols = c;
			state.rows = r;
		},
		kill: () => {
			state.killed = true;
		},
		onData: () => {},
		onExit: () => {},
	};
}

interface SentFrame {
	message: ServerMessage;
	payload: Uint8Array | null;
}

function makeConn(): Conn & { sent: SentFrame[] } {
	const sent: SentFrame[] = [];
	return {
		sent,
		subscriptions: new Set(),
		send: (m, payload) => sent.push({ message: m, payload: payload ?? null }),
	};
}

let nextPid = 1000;
let states: FakePtyState[] = [];
let wired: Pty[] = [];

function makeCtx(): HandlerCtx & {
	spawnedStates: FakePtyState[];
	wired: Pty[];
} {
	const store = new SessionStore();
	return {
		store,
		spawnedStates: states,
		wired,
		wireSession: (s) => {
			wired.push(s.pty);
		},
		spawnPty: (opts) => {
			const state: FakePtyState = {
				pid: nextPid++,
				cols: opts.meta.cols,
				rows: opts.meta.rows,
				written: [],
				killed: false,
			};
			states.push(state);
			return makeFakePty(state, opts.meta);
		},
	};
}

beforeEach(() => {
	nextPid = 1000;
	states = [];
	wired = [];
});

describe("handlers", () => {
	test("open: spawns a session and replies open-ok", () => {
		const ctx = makeCtx();
		const reply = handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		expect(reply.type).toBe("open-ok");
		if (reply.type === "open-ok") expect(reply.pid).toBe(1000);
		expect(ctx.store.size()).toBe(1);
		expect(ctx.wired).toHaveLength(1);
	});

	test("open: rejects duplicate ids", () => {
		const ctx = makeCtx();
		const meta = { shell: "/bin/sh", argv: [], cols: 80, rows: 24 };
		handleOpen(ctx, { type: "open", id: "s0", meta });
		const reply = handleOpen(ctx, { type: "open", id: "s0", meta });
		expect(reply.type).toBe("error");
	});

	test("input writes bytes to the pty", () => {
		const ctx = makeCtx();
		handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const result = handleInput(
			ctx,
			{ type: "input", id: "s0" },
			Buffer.from("hello"),
		);
		expect(result).toBeUndefined();
		expect(states[0]?.written.map((b) => b.toString())).toEqual(["hello"]);
	});

	test("input on missing session returns error", () => {
		const ctx = makeCtx();
		const result = handleInput(
			ctx,
			{ type: "input", id: "missing" },
			Buffer.alloc(0),
		);
		expect(result?.type).toBe("error");
	});

	test("resize updates dims", () => {
		const ctx = makeCtx();
		handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		expect(
			handleResize(ctx, { type: "resize", id: "s0", cols: 100, rows: 30 }),
		).toBeUndefined();
		expect(states[0]?.cols).toBe(100);
		expect(states[0]?.rows).toBe(30);
	});

	test("close kills the pty and replies closed", () => {
		const ctx = makeCtx();
		handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const reply = handleClose(ctx, { type: "close", id: "s0" });
		expect(reply.type).toBe("closed");
		expect(states[0]?.killed).toBe(true);
	});

	test("list returns all sessions", () => {
		const ctx = makeCtx();
		const meta = { shell: "/bin/sh", argv: [], cols: 80, rows: 24 };
		handleOpen(ctx, { type: "open", id: "a", meta });
		handleOpen(ctx, { type: "open", id: "b", meta });
		const reply = handleList(ctx);
		expect(reply.sessions).toHaveLength(2);
	});

	test("subscribe with replay sends buffered output", () => {
		const ctx = makeCtx();
		handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const session = ctx.store.get("s0");
		if (!session) throw new Error("no session");
		ctx.store.appendOutput(session, Buffer.from("prior bytes"));

		const conn = makeConn();
		handleSubscribe(ctx, conn, { type: "subscribe", id: "s0", replay: true });
		expect(conn.subscriptions.has("s0")).toBe(true);
		expect(conn.sent).toHaveLength(1);
		const frame = conn.sent[0];
		expect(frame?.message.type).toBe("output");
		expect(frame?.payload).toBeTruthy();
		if (frame?.payload) {
			expect(Buffer.from(frame.payload).toString()).toBe("prior bytes");
		}
	});

	test("subscribe without replay does not send buffered output", () => {
		const ctx = makeCtx();
		handleOpen(ctx, {
			type: "open",
			id: "s0",
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const session = ctx.store.get("s0");
		if (!session) throw new Error("no session");
		ctx.store.appendOutput(session, Buffer.from("prior bytes"));

		const conn = makeConn();
		handleSubscribe(ctx, conn, { type: "subscribe", id: "s0", replay: false });
		expect(conn.subscriptions.has("s0")).toBe(true);
		expect(conn.sent).toHaveLength(0);
	});

	test("unsubscribe removes from conn.subscriptions", () => {
		const conn = makeConn();
		conn.subscriptions.add("s0");
		handleUnsubscribe(conn, { type: "unsubscribe", id: "s0" });
		expect(conn.subscriptions.has("s0")).toBe(false);
	});
});
