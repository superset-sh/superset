import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Pty } from "../Pty/index.ts";
import { SessionStore } from "./SessionStore.ts";
import {
	clearSnapshot,
	readSnapshot,
	serializeSessions,
	SNAPSHOT_VERSION,
	writeSnapshot,
} from "./snapshot.ts";

function fakePty(pid: number, meta: { cols: number; rows: number }): Pty {
	return {
		pid,
		meta: { shell: "/bin/sh", argv: [], cols: meta.cols, rows: meta.rows },
		write: () => {},
		resize: () => {},
		kill: () => {},
		onData: () => {},
		onExit: () => {},
		getMasterFd: () => -1,
	};
}

function tmpPath(): string {
	return path.join(
		os.tmpdir(),
		`pty-daemon-snapshot-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
	);
}

describe("handoff snapshot", () => {
	test("serializeSessions excludes exited sessions", () => {
		const store = new SessionStore();
		const a = store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		const b = store.add("b", fakePty(101, { cols: 100, rows: 30 }));
		b.exited = true;
		const snapshot = serializeSessions({
			sessions: store.all(),
			fdIndexBySessionId: new Map([
				["a", 3],
				["b", 4],
			]),
		});
		expect(snapshot.version).toBe(SNAPSHOT_VERSION);
		expect(snapshot.sessions).toHaveLength(1);
		expect(snapshot.sessions[0]?.id).toBe("a");
		expect(snapshot.sessions[0]?.fdIndex).toBe(3);
	});

	test("serializeSessions throws when fdIndex is missing", () => {
		const store = new SessionStore();
		store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		expect(() =>
			serializeSessions({
				sessions: store.all(),
				fdIndexBySessionId: new Map(),
			}),
		).toThrow(/no fdIndex assigned/);
	});

	test("serializeSessions captures the ring buffer as base64", () => {
		const store = new SessionStore();
		const session = store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		store.appendOutput(session, Buffer.from("hello"));
		store.appendOutput(session, Buffer.from(" world"));
		const snapshot = serializeSessions({
			sessions: store.all(),
			fdIndexBySessionId: new Map([["a", 3]]),
		});
		expect(
			Buffer.from(snapshot.sessions[0]?.buffer ?? "", "base64").toString(),
		).toBe("hello world");
	});

	test("write + read round-trips", () => {
		const store = new SessionStore();
		store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		store.add("b", fakePty(101, { cols: 100, rows: 30 }));
		const snapshot = serializeSessions({
			sessions: store.all(),
			fdIndexBySessionId: new Map([
				["a", 3],
				["b", 4],
			]),
		});
		const p = tmpPath();
		try {
			writeSnapshot(p, snapshot);
			const decoded = readSnapshot(p);
			expect(decoded).toEqual(snapshot);
		} finally {
			clearSnapshot(p);
		}
	});

	test("readSnapshot rejects malformed payloads", () => {
		const p = tmpPath();
		try {
			fs.writeFileSync(p, JSON.stringify({ version: 1, sessions: "nope" }));
			expect(() => readSnapshot(p)).toThrow(/malformed/);
		} finally {
			clearSnapshot(p);
		}
	});

	test("readSnapshot rejects unsupported version", () => {
		const p = tmpPath();
		try {
			fs.writeFileSync(
				p,
				JSON.stringify({ version: 99, writtenAt: 0, sessions: [] }),
			);
			expect(() => readSnapshot(p)).toThrow(/unsupported snapshot version/);
		} finally {
			clearSnapshot(p);
		}
	});

	test("clearSnapshot is idempotent", () => {
		const p = tmpPath();
		clearSnapshot(p);
		clearSnapshot(p);
	});
});
