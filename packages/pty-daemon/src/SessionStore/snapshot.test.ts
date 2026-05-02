import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Pty } from "../Pty/index.ts";
import { SessionStore } from "./SessionStore.ts";
import {
	clearSnapshot,
	readSnapshot,
	SNAPSHOT_VERSION,
	serializeSessions,
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
		`pty-daemon-snapshot-${process.pid}-${Math.random().toString(36).slice(2)}.bin`,
	);
}

describe("handoff snapshot", () => {
	test("serializeSessions excludes exited sessions", () => {
		const store = new SessionStore();
		const _a = store.add("a", fakePty(100, { cols: 80, rows: 24 }));
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

	test("serializeSessions captures the ring buffer as raw bytes", () => {
		const store = new SessionStore();
		const session = store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		store.appendOutput(session, Buffer.from("hello"));
		store.appendOutput(session, Buffer.from(" world"));
		const snapshot = serializeSessions({
			sessions: store.all(),
			fdIndexBySessionId: new Map([["a", 3]]),
		});
		const buf = snapshot.sessions[0]?.buffer ?? new Uint8Array(0);
		expect(Buffer.from(buf).toString("utf8")).toBe("hello world");
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

	test("readSnapshot rejects garbage bytes", () => {
		const p = tmpPath();
		try {
			fs.writeFileSync(p, Buffer.from("not a frame"));
			expect(() => readSnapshot(p)).toThrow();
		} finally {
			clearSnapshot(p);
		}
	});

	test("readSnapshot rejects unsupported version", () => {
		const p = tmpPath();
		try {
			// Hand-roll a header frame at version 99 using the same wire layout
			// used by writeSnapshot, so the decoder gets past framing and we
			// exercise the version check specifically.
			const headerJson = JSON.stringify({
				type: "handoff-header",
				version: 99,
				writtenAt: 0,
				sessionCount: 0,
			});
			const jsonBytes = Buffer.from(headerJson, "utf8");
			const totalLen = 4 + jsonBytes.byteLength;
			const buf = Buffer.alloc(4 + totalLen);
			buf.writeUInt32BE(totalLen, 0);
			buf.writeUInt32BE(jsonBytes.byteLength, 4);
			jsonBytes.copy(buf, 8);
			fs.writeFileSync(p, buf);
			expect(() => readSnapshot(p)).toThrow(/unsupported snapshot version/);
		} finally {
			clearSnapshot(p);
		}
	});

	test("write + read round-trips a session with binary buffer bytes", () => {
		const store = new SessionStore();
		const session = store.add("a", fakePty(100, { cols: 80, rows: 24 }));
		// Mix of valid and invalid UTF-8 to prove byte fidelity.
		const bytes = Buffer.from([0x00, 0xff, 0xc3, 0xa9, 0x80, 0x7f, 0xfe]);
		store.appendOutput(session, bytes);
		const snapshot = serializeSessions({
			sessions: store.all(),
			fdIndexBySessionId: new Map([["a", 3]]),
		});
		const p = tmpPath();
		try {
			writeSnapshot(p, snapshot);
			const decoded = readSnapshot(p);
			expect(decoded.sessions).toHaveLength(1);
			expect(
				Buffer.compare(decoded.sessions[0]?.buffer ?? new Uint8Array(), bytes),
			).toBe(0);
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
