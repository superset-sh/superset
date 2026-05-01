import { describe, expect, test } from "bun:test";
import type { Pty } from "../Pty/index.ts";
import { SessionStore } from "./SessionStore.ts";

function fakePty(meta: { cols: number; rows: number }): Pty {
	return {
		pid: 12345,
		meta: {
			shell: "/bin/sh",
			argv: [],
			cols: meta.cols,
			rows: meta.rows,
		},
		write: () => {},
		resize: () => {},
		kill: () => {},
		onData: () => {},
		onExit: () => {},
	};
}

describe("SessionStore", () => {
	test("add / get / delete", () => {
		const store = new SessionStore();
		const pty = fakePty({ cols: 80, rows: 24 });
		store.add("s0", pty);
		expect(store.size()).toBe(1);
		expect(store.get("s0")?.id).toBe("s0");
		expect(store.delete("s0")).toBe(true);
		expect(store.size()).toBe(0);
	});

	test("rejects duplicate ids", () => {
		const store = new SessionStore();
		const pty = fakePty({ cols: 80, rows: 24 });
		store.add("s0", pty);
		expect(() => store.add("s0", pty)).toThrow(/already exists/);
	});

	test("list reflects sessions", () => {
		const store = new SessionStore();
		store.add("a", fakePty({ cols: 80, rows: 24 }));
		store.add("b", fakePty({ cols: 100, rows: 30 }));
		const list = store.list();
		expect(list).toHaveLength(2);
		expect(list.map((s) => s.id).sort()).toEqual(["a", "b"]);
	});

	test("appendOutput accumulates within cap", () => {
		const store = new SessionStore({ bufferCap: 100 });
		const session = store.add("s0", fakePty({ cols: 80, rows: 24 }));
		store.appendOutput(session, Buffer.from("hello"));
		store.appendOutput(session, Buffer.from(" world"));
		expect(store.snapshotBuffer(session).toString()).toBe("hello world");
		expect(session.bufferBytes).toBe(11);
	});

	test("appendOutput evicts oldest chunks when exceeding cap", () => {
		const store = new SessionStore({ bufferCap: 10 });
		const session = store.add("s0", fakePty({ cols: 80, rows: 24 }));
		store.appendOutput(session, Buffer.from("AAAA")); // 4
		store.appendOutput(session, Buffer.from("BBBB")); // 8
		store.appendOutput(session, Buffer.from("CCCCCC")); // would be 14 → evict AAAA
		const snap = store.snapshotBuffer(session).toString();
		expect(snap).toBe("BBBBCCCCCC");
		expect(session.bufferBytes).toBe(10);
	});

	test("appendOutput keeps buffer within cap across many writes", () => {
		const store = new SessionStore({ bufferCap: 32 });
		const session = store.add("s0", fakePty({ cols: 80, rows: 24 }));
		for (let i = 0; i < 100; i++) {
			store.appendOutput(
				session,
				Buffer.from(`chunk${i.toString().padStart(2, "0")}-`),
			);
		}
		expect(session.bufferBytes).toBeLessThanOrEqual(32);
		// Final chunk must always be present
		expect(store.snapshotBuffer(session).toString()).toContain("chunk99-");
	});
});
