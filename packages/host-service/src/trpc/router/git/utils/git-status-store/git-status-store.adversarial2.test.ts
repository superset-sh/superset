import { describe, expect, test } from "bun:test";
import type { Branch, ChangedFile } from "../../types";
import type { GitStatusSnapshot } from "../git-status";
import type { GitStatusPartial } from "../git-status-partial";
import { GitStatusStore } from "./git-status-store";

const BRANCH: Branch = {
	name: "main",
	isHead: true,
	upstream: null,
	aheadCount: 0,
	behindCount: 0,
	lastCommitHash: "abc",
	lastCommitDate: "2026-01-01",
};

function file(path: string, status: ChangedFile["status"] = "modified") {
	return { path, status, additions: 1, deletions: 0 } satisfies ChangedFile;
}

function snapshot(
	unstaged: ChangedFile[] = [],
	ignoredPaths: string[] = [],
): GitStatusSnapshot {
	return {
		currentBranch: BRANCH,
		defaultBranch: BRANCH,
		againstBase: [],
		staged: [],
		unstaged,
		ignoredPaths,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("round 2: GitStatusStore", () => {
	test("an escalating partial drops its ignoredPaths; the full walk's list is what gets cached", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let fullCalls = 0;
		const computeFull = async () => {
			fullCalls++;
			return snapshot([file("a", "deleted")], ["from-full"]);
		};
		const computePartial = async (
			paths: string[],
		): Promise<GitStatusPartial> => ({
			paths,
			unstaged: [file("a", "deleted")],
			ignoredPaths: ["from-partial"],
			ignoredScope: ["from-partial"],
		});
		const read = () =>
			store.read({
				workspaceId: "w",
				baseBranch: null,
				computeFull,
				computePartial,
			});
		await read();
		store.recordChange("w", ["a"]);
		const result = await read();
		expect(fullCalls).toBe(2);
		expect(result.ignoredPaths).toEqual(["from-full"]);
		store.recordChange("w", []);
		const cached = await read();
		expect(fullCalls).toBe(2);
		expect(cached.ignoredPaths).toEqual(["from-full"]);
	});

	test("a partial that returns an empty scope (every path filtered) leaves the cache untouched and keeps no pending", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let fullCalls = 0;
		let partialCalls = 0;
		const cachedSnapshot = snapshot([file("keep")], ["ign"]);
		const computeFull = async () => {
			fullCalls++;
			return cachedSnapshot;
		};
		const computePartial = async (): Promise<GitStatusPartial> => {
			partialCalls++;
			return { paths: [], unstaged: [] };
		};
		const read = () =>
			store.read({
				workspaceId: "w",
				baseBranch: null,
				computeFull,
				computePartial,
			});
		await read();
		store.recordChange("w", ["../escape"]);
		const result = await read();
		expect(partialCalls).toBe(1);
		expect(fullCalls).toBe(1);
		expect(result).toBe(cachedSnapshot);
		await read();
		expect(partialCalls).toBe(1);
	});

	test("recordChange during a partial on variant A does not leak into variant B's already-copied path list", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		const seen: { a: string[][]; b: string[][] } = { a: [], b: [] };
		const gateA = deferred<void>();
		const make = (key: "a" | "b") => ({
			computeFull: async () => snapshot(),
			computePartial: async (paths: string[]): Promise<GitStatusPartial> => {
				seen[key].push([...paths]);
				if (key === "a") await gateA.promise;
				return { paths, unstaged: [] };
			},
		});
		await store.read({ workspaceId: "w", baseBranch: null, ...make("a") });
		await store.read({ workspaceId: "w", baseBranch: "main", ...make("b") });
		store.recordChange("w", ["x"]);
		const readA = store.read({
			workspaceId: "w",
			baseBranch: null,
			...make("a"),
		});
		await Promise.resolve();
		store.recordChange("w", ["y"]);
		const resultB = await store.read({
			workspaceId: "w",
			baseBranch: "main",
			...make("b"),
		});
		gateA.resolve();
		await readA;
		expect(seen.a).toEqual([["x"]]);
		expect(seen.b).toEqual([["x", "y"]]);
		expect(resultB.unstaged).toEqual([]);
		// A's pending still holds the change that landed mid-partial.
		const again = await store.read({
			workspaceId: "w",
			baseBranch: null,
			...make("a"),
		});
		expect(seen.a).toEqual([["x"], ["y"]]);
		expect(again.unstaged).toEqual([]);
	});

	test("a rejected read never leaves the variant queue wedged for a later caller", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let attempt = 0;
		const computeFull = async () => {
			attempt++;
			if (attempt === 1) throw new Error("boom");
			return snapshot([file("ok")]);
		};
		const computePartial = async (
			paths: string[],
		): Promise<GitStatusPartial> => ({
			paths,
			unstaged: [],
		});
		const input = {
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial,
		};
		const first = store.read(input);
		const second = store.read(input);
		await expect(first).rejects.toThrow("boom");
		const result = await second;
		expect(result.unstaged.map((f) => f.path)).toEqual(["ok"]);
		expect(attempt).toBe(2);
	});

	test("recordChange(undefined) between two queued reads forces the second to walk again", async () => {
		const store = new GitStatusStore();
		store.attach("w");
		let fullCalls = 0;
		const gate = deferred<void>();
		const started = deferred<void>();
		const computeFull = async () => {
			fullCalls++;
			const mine = fullCalls;
			if (mine === 1) {
				started.resolve();
				await gate.promise;
			}
			return snapshot([file(`walk${mine}`)]);
		};
		const computePartial = async (
			paths: string[],
		): Promise<GitStatusPartial> => ({
			paths,
			unstaged: [],
		});
		const input = {
			workspaceId: "w",
			baseBranch: null,
			computeFull,
			computePartial,
		};
		const first = store.read(input);
		const second = store.read(input);
		// The walk must be underway before the broad change lands, otherwise
		// the walk legitimately covers it.
		await started.promise;
		store.recordChange("w", undefined);
		gate.resolve();
		const [a, b] = await Promise.all([first, second]);
		expect(a.unstaged[0]?.path).toBe("walk1");
		expect(b.unstaged[0]?.path).toBe("walk2");
		expect(fullCalls).toBe(2);
	});
});
