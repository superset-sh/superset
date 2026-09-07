import { describe, expect, it } from "bun:test";
import { DetachedProcessResolver } from "./detached.ts";

const TERMINAL = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

interface Harness {
	resolver: DetachedProcessResolver;
	reads: number[][];
	env: Map<number, string | null>;
}

function harness(env: Map<number, string | null>): Harness {
	const reads: number[][] = [];
	const resolver = new DetachedProcessResolver(async (pids) => {
		reads.push(pids);
		return new Map(pids.map((pid) => [pid, env.get(pid) ?? null]));
	});
	return { resolver, reads, env };
}

/**
 * shell 100 (tree: 100, 101) · orphaned server root 500 → 501 → 502 with
 * only the root's environment readable · unrelated daemon 900.
 */
const table = [
	{ pid: 1, ppid: 0 },
	{ pid: 50, ppid: 1 },
	{ pid: 100, ppid: 50 },
	{ pid: 101, ppid: 100 },
	{ pid: 500, ppid: 1 },
	{ pid: 501, ppid: 500 },
	{ pid: 502, ppid: 501 },
	{ pid: 900, ppid: 1 },
];
const tree = new Set([100, 101]);

describe("DetachedProcessResolver", () => {
	it("fails closed when an unreadable listener loses its last readable ancestor", async () => {
		const { resolver, env } = harness(new Map([[500, TERMINAL]]));
		const args = { excludePids: tree, terminalIds: new Set([TERMINAL]) };
		expect((await resolver.resolve({ table, ...args })).get(501)).toBe(
			TERMINAL,
		);
		env.delete(500);
		const orphaned = table
			.filter((row) => row.pid !== 500)
			.map((row) => (row.pid === 501 ? { ...row, ppid: 1 } : row));
		// Without readable provenance, guessing would risk attributing another process.
		expect((await resolver.resolve({ table: orphaned, ...args })).size).toBe(0);
	});

	it("resolves a large snapshot once per scan without mixing terminal owners", async () => {
		const rows = Array.from({ length: 10000 }, (_, i) => ({
			pid: i + 1000,
			ppid: i % 2 === 0 ? 500 : 600,
		}));
		const largeTable = [{ pid: 500, ppid: 1 }, { pid: 600, ppid: 1 }, ...rows];
		const { resolver, reads } = harness(
			new Map([
				[500, TERMINAL],
				[600, OTHER],
			]),
		);
		const args = {
			table: largeTable,
			excludePids: new Set<number>(),
			terminalIds: new Set([TERMINAL, OTHER]),
		};
		for (let scan = 0; scan < 3; scan++) {
			const result = await resolver.resolve(args);
			expect(result.size).toBe(10002);
			for (const row of rows)
				expect(result.get(row.pid)).toBe(row.ppid === 500 ? TERMINAL : OTHER);
		}
		expect(reads).toHaveLength(3);
	});
	it("attributes an orphaned root and its descendants via the root's environment", async () => {
		const { resolver } = harness(new Map([[500, TERMINAL]]));
		const resolved = await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL]),
		});
		expect([...resolved.entries()]).toEqual([
			[500, TERMINAL],
			[501, TERMINAL],
			[502, TERMINAL],
		]);
	});

	it("never reads the environment of tree pids, and skips them in the result", async () => {
		const { resolver, reads } = harness(new Map([[100, TERMINAL]]));
		const resolved = await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL]),
		});
		expect(reads[0]).not.toContain(100);
		expect(reads[0]).not.toContain(101);
		expect(resolved.size).toBe(0);
	});

	it("the nearest ancestor's id wins over a farther one", async () => {
		// 501 was launched with a different terminal id than its parent 500 —
		// e.g. a nested Superset's own shells. 502 inherits from 501.
		const { resolver } = harness(
			new Map([
				[500, TERMINAL],
				[501, OTHER],
			]),
		);
		const resolved = await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL, OTHER]),
		});
		expect(resolved.get(500)).toBe(TERMINAL);
		expect(resolved.get(501)).toBe(OTHER);
		expect(resolved.get(502)).toBe(OTHER);
	});

	it("drops ids that are not registered terminals", async () => {
		const { resolver } = harness(new Map([[500, OTHER]]));
		const resolved = await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL]),
		});
		expect(resolved.size).toBe(0);
	});

	it("returns nothing and reads nothing when no terminals are registered", async () => {
		const { resolver, reads } = harness(new Map([[500, TERMINAL]]));
		const resolved = await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set(),
		});
		expect(resolved.size).toBe(0);
		expect(reads).toHaveLength(0);
	});

	it("refreshes environment each scan and follows exits and reparenting", async () => {
		const { resolver, reads, env } = harness(new Map([[500, TERMINAL]]));
		const args = { excludePids: tree, terminalIds: new Set([TERMINAL]) };

		await resolver.resolve({ table, ...args });
		expect(reads).toHaveLength(1);

		await resolver.resolve({ table, ...args });
		expect(reads).toHaveLength(2);

		// 900 exits, 901 appears, and 501's parent dies so it reparents to 1.
		const next = table
			.filter((row) => row.pid !== 900 && row.pid !== 500)
			.map((row) => (row.pid === 501 ? { pid: 501, ppid: 1 } : row))
			.concat([{ pid: 901, ppid: 1 }]);
		env.set(501, TERMINAL);
		const resolved = await resolver.resolve({ table: next, ...args });
		expect(reads).toHaveLength(3);
		expect(reads[2]).toEqual([1, 50, 501, 502, 901]);
		expect(resolved.get(501)).toBe(TERMINAL);
		expect(resolved.get(502)).toBe(TERMINAL);
	});

	it("does not retain ownership when a PID is reused with the same parent", async () => {
		const { resolver, reads, env } = harness(new Map([[500, TERMINAL]]));
		const args = {
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL, OTHER]),
		};
		expect((await resolver.resolve(args)).get(502)).toBe(TERMINAL);

		// PID 500 exits and is reused between snapshots, still parented to PID 1.
		env.set(500, OTHER);
		const replaced = await resolver.resolve(args);
		expect(replaced.get(500)).toBe(OTHER);
		expect(replaced.get(502)).toBe(OTHER);
		expect(reads).toHaveLength(2);

		// Another replacement has no terminal owner at all.
		env.delete(500);
		expect((await resolver.resolve(args)).size).toBe(0);
	});

	it("retries an unreadable environment on the next scan", async () => {
		const { resolver, env } = harness(new Map());
		const args = { table, excludePids: tree, terminalIds: new Set([TERMINAL]) };
		expect((await resolver.resolve(args)).size).toBe(0);
		env.set(500, TERMINAL);
		expect((await resolver.resolve(args)).get(500)).toBe(TERMINAL);
	});

	it("passes the abort signal to the reader", async () => {
		let seen: AbortSignal | undefined;
		const resolver = new DetachedProcessResolver(async (pids, signal) => {
			seen = signal;
			return new Map(pids.map((pid) => [pid, null]));
		});
		const controller = new AbortController();
		await resolver.resolve({
			table,
			excludePids: tree,
			terminalIds: new Set([TERMINAL]),
			signal: controller.signal,
		});
		expect(seen).toBe(controller.signal);
	});
});
