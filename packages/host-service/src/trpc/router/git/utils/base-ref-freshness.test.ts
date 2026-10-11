import {
	afterEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import { scheduleBaseRefFetch } from "./base-ref-freshness";

// Distinct remote/branch per test so the module-level state (keyed by
// commonDir#remote/branch) doesn't leak across tests.
function createGit(
	options: {
		fetch?: () => Promise<unknown>;
		commonDir?: string;
		refs?: Map<string, string>;
	} = {},
) {
	const fetchCalls: string[][] = [];
	const revParseCalls: string[][] = [];
	const refs = options.refs ?? new Map<string, string>();
	const git = {
		raw: mock(async (args: string[]) => {
			revParseCalls.push(args);
			if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
				return `${options.commonDir ?? ".git"}\n`;
			}
			if (args[0] === "rev-parse" && args[1] === "--verify") {
				const ref = refs.get(args[3] ?? "");
				if (ref === undefined) throw new Error("not a ref");
				return `${ref}\n`;
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
		fetch: mock(async (args: string[]) => {
			fetchCalls.push(args);
			return options.fetch ? options.fetch() : undefined;
		}),
	} as never as import("simple-git").SimpleGit;
	return { git, fetchCalls, revParseCalls, refs };
}

function reader(workspaceId: string, snapshotStartedAt = Date.now()) {
	return { workspaceId, snapshotStartedAt };
}

/** A fetch that moves `refs/remotes/<remote>/<branch>` to `oid`. */
function fetchMoving(
	refs: Map<string, string>,
	target: { remote: string; branch: string },
	oid: string,
) {
	return async () => {
		refs.set(`refs/remotes/${target.remote}/${target.branch}`, oid);
	};
}

const MINUTE = 60_000;

afterEach(() => {
	setSystemTime();
});

describe("scheduleBaseRefFetch", () => {
	test("fetches the base branch with the expected args", async () => {
		const { git, fetchCalls } = createGit();
		await scheduleBaseRefFetch(
			git,
			"/repo/wt-a",
			{ remote: "origin", branch: "main" },
			reader("ws-a"),
		);
		expect(fetchCalls).toEqual([["origin", "main", "--quiet", "--no-tags"]]);
	});

	test("dedupes repeat calls within the TTL window", async () => {
		const { git, fetchCalls } = createGit();
		const target = { remote: "origin", branch: "ttl-branch" };
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target, reader("ws"));
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target, reader("ws"));
		await scheduleBaseRefFetch(git, "/repo/wt-ttl", target, reader("ws"));
		expect(fetchCalls).toHaveLength(1);
	});

	test("resolves the common dir once within the TTL (path cache)", async () => {
		const { git, revParseCalls } = createGit();
		const target = { remote: "origin", branch: "fresh-branch" };
		await scheduleBaseRefFetch(git, "/repo/wt-fresh", target, reader("ws"));
		await scheduleBaseRefFetch(git, "/repo/wt-fresh", target, reader("ws"));
		// One rev-parse across both calls — resolving per call spawns git on
		// the event loop before the fetch-TTL check, on every status poll. A
		// stale mapping only mis-keys the dedupe (extra/suppressed fetch,
		// TTL-bounded); the fetch itself always runs in worktreePath.
		const commonDirCalls = revParseCalls.filter(
			(args) => args[1] === "--git-common-dir",
		);
		expect(commonDirCalls).toHaveLength(1);
	});

	test("coalesces concurrent calls into a single in-flight fetch", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { git, fetchCalls } = createGit({ fetch: () => gate });
		const target = { remote: "origin", branch: "inflight-branch" };
		const a = scheduleBaseRefFetch(
			git,
			"/repo/wt-inflight",
			target,
			reader("a"),
		);
		const b = scheduleBaseRefFetch(
			git,
			"/repo/wt-inflight",
			target,
			reader("b"),
		);
		release();
		await Promise.all([a, b]);
		expect(fetchCalls).toHaveLength(1);
	});

	test("dedupes worktrees that resolve to the same common Git directory", async () => {
		const target = { remote: "origin", branch: "shared-worktrees-branch" };
		const a = createGit({ commonDir: "/repo/.git" });
		const b = createGit({ commonDir: "/repo/.git" });
		let fetches = 0;
		const fetchBaseRef = async () => {
			fetches++;
		};

		// Paths must be unique to this test: the commonDir cache is keyed by
		// worktree path, so reusing another test's path would resolve stale.
		await Promise.all([
			scheduleBaseRefFetch(
				a.git,
				"/repo/wt-shared-a",
				target,
				reader("a"),
				fetchBaseRef,
			),
			scheduleBaseRefFetch(
				b.git,
				"/repo/wt-shared-b",
				target,
				reader("b"),
				fetchBaseRef,
			),
		]);

		expect(fetches).toBe(1);
	});

	test("reports the reader when the fetch moves the ref", async () => {
		const { git, refs } = createGit();
		const target = { remote: "origin", branch: "moves-branch" };
		expect(
			await scheduleBaseRefFetch(
				git,
				"/repo/wt-moves",
				target,
				reader("ws-moves"),
				fetchMoving(refs, target, "abc123"),
			),
		).toEqual(["ws-moves"]);
	});

	test("reports nothing when the fetch leaves the ref where it was", async () => {
		const target = { remote: "origin", branch: "still-branch" };
		const refs = new Map([["refs/remotes/origin/still-branch", "abc123"]]);
		const { git } = createGit({ refs });
		expect(
			await scheduleBaseRefFetch(
				git,
				"/repo/wt-still",
				target,
				reader("ws-still"),
				fetchMoving(refs, target, "abc123"),
			),
		).toEqual([]);
	});

	test("a fetch from one worktree reports every worktree that read the ref", async () => {
		const target = { remote: "origin", branch: "siblings-branch" };
		const refs = new Map<string, string>();
		const a = createGit({ commonDir: "/siblings/.git", refs });
		const b = createGit({ commonDir: "/siblings/.git", refs });
		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			setSystemTime(new Date("2026-10-11T10:00:00Z"));
			// B reads first and its fetch fails, leaving B with an empty diff.
			await scheduleBaseRefFetch(
				b.git,
				"/siblings/wt-b",
				target,
				reader("ws-b"),
				() => Promise.reject(new Error("offline")),
			);
			// After the TTL, A's fetch succeeds and B must refresh too.
			setSystemTime(new Date("2026-10-11T10:06:00Z"));
			const stale = await scheduleBaseRefFetch(
				a.git,
				"/siblings/wt-a",
				target,
				reader("ws-a"),
				fetchMoving(refs, target, "def456"),
			);
			expect(stale.sort()).toEqual(["ws-a", "ws-b"]);
		} finally {
			console.warn = originalWarn;
		}
	});

	test("reports a reader whose snapshot was computing when the ref moved", async () => {
		const target = { remote: "origin", branch: "race-branch" };
		const refs = new Map<string, string>();
		const a = createGit({ commonDir: "/race/.git", refs });
		const b = createGit({ commonDir: "/race/.git", refs });
		setSystemTime(new Date("2026-10-11T11:00:00Z"));
		const bSnapshotStartedAt = Date.now();
		setSystemTime(new Date(bSnapshotStartedAt + 1_000));
		await scheduleBaseRefFetch(
			a.git,
			"/race/wt-a",
			target,
			reader("ws-a"),
			fetchMoving(refs, target, "aaa111"),
		);
		// B's walk began before the fetch landed, so it read the old ref; its
		// own request is inside the TTL and must still report B.
		setSystemTime(new Date(bSnapshotStartedAt + 2_000));
		expect(
			await scheduleBaseRefFetch(
				b.git,
				"/race/wt-b",
				target,
				reader("ws-b", bSnapshotStartedAt),
			),
		).toEqual(["ws-b"]);
		// A snapshot that started after the fetch already saw the new ref.
		expect(
			await scheduleBaseRefFetch(
				b.git,
				"/race/wt-b",
				target,
				reader("ws-b", bSnapshotStartedAt + 1.5 * MINUTE),
			),
		).toEqual([]);
	});

	test("joiners of an in-flight fetch are reported by the fetch that owns it", async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const target = { remote: "origin", branch: "joiners-branch" };
		const refs = new Map<string, string>();
		const { git } = createGit({ refs });
		const owner = scheduleBaseRefFetch(
			git,
			"/repo/wt-joiners",
			target,
			reader("ws-1"),
			async () => {
				await gate;
				refs.set("refs/remotes/origin/joiners-branch", "bbb222");
			},
		);
		const joiner = scheduleBaseRefFetch(
			git,
			"/repo/wt-joiners",
			target,
			reader("ws-2"),
		);
		release();
		expect((await owner).sort()).toEqual(["ws-1", "ws-2"]);
		expect(await joiner).toEqual([]);
	});

	test("never rejects when the fetch fails", async () => {
		const { git, fetchCalls } = createGit({
			fetch: () => Promise.reject(new Error("offline")),
		});
		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			expect(
				await scheduleBaseRefFetch(
					git,
					"/repo/wt-fail",
					{ remote: "origin", branch: "fail-branch" },
					reader("ws-fail"),
				),
			).toEqual([]);
		} finally {
			console.warn = originalWarn;
		}
		expect(fetchCalls).toHaveLength(1);
	});
});
