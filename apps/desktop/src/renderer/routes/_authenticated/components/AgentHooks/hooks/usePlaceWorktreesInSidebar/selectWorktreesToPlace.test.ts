import { describe, expect, it } from "bun:test";
import {
	selectWorktreesToPlace,
	type WorkspaceForPlacement,
} from "./selectWorktreesToPlace";

const LOCAL = "machine-local";
const REMOTE_ONLINE = "machine-remote-online";
const REMOTE_OFFLINE = "machine-remote-offline";
const ME = "user-me";
const TEAMMATE = "user-teammate";

const hosts = {
	machineId: LOCAL,
	onlineHostIds: new Set([LOCAL, REMOTE_ONLINE]),
	currentUserId: ME,
};

function worktree(
	id: string,
	overrides: Partial<WorkspaceForPlacement> = {},
): WorkspaceForPlacement {
	return {
		id,
		projectId: "p1",
		type: "worktree",
		hostId: LOCAL,
		hostReachable: true,
		createdByUserId: ME,
		...overrides,
	};
}

describe("selectWorktreesToPlace", () => {
	it("places worktrees that have no local-state row", () => {
		const result = selectWorktreesToPlace([worktree("wt-1")], new Set(), hosts);

		expect(result).toEqual([{ id: "wt-1", projectId: "p1" }]);
	});

	it("never places main workspaces — they surface via the gated path", () => {
		const result = selectWorktreesToPlace(
			[worktree("main-1", { type: "main" }), worktree("wt-1")],
			new Set(),
			hosts,
		);

		expect(result).toEqual([{ id: "wt-1", projectId: "p1" }]);
	});

	it("skips worktrees that already have a row (placed, hidden, or removed)", () => {
		const result = selectWorktreesToPlace(
			[worktree("wt-seen"), worktree("wt-new")],
			new Set(["wt-seen"]),
			hosts,
		);

		expect(result).toEqual([{ id: "wt-new", projectId: "p1" }]);
	});

	it("places session workspaces with no project (e.g. automation runs)", () => {
		const result = selectWorktreesToPlace(
			[worktree("sess-1", { type: "session", projectId: null })],
			new Set(),
			hosts,
		);

		expect(result).toEqual([{ id: "sess-1", projectId: null }]);
	});

	it("skips sessions that already have a row", () => {
		const result = selectWorktreesToPlace(
			[
				worktree("sess-seen", { type: "session", projectId: null }),
				worktree("sess-new", { type: "session", projectId: null }),
			],
			new Set(["sess-seen"]),
			hosts,
		);

		expect(result).toEqual([{ id: "sess-new", projectId: null }]);
	});

	it("never places a worktree missing its project", () => {
		const result = selectWorktreesToPlace(
			[worktree("wt-broken", { projectId: null })],
			new Set(),
			hosts,
		);

		expect(result).toEqual([]);
	});

	describe("remote hosts", () => {
		it("places a worktree on an online remote host that answered (#7100)", () => {
			const result = selectWorktreesToPlace(
				[worktree("wt-remote", { hostId: REMOTE_ONLINE })],
				new Set(),
				hosts,
			);

			expect(result).toEqual([{ id: "wt-remote", projectId: "p1" }]);
		});

		it("places a session on an online remote host (automation run on a headless box)", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("sess-remote", {
						type: "session",
						projectId: null,
						hostId: REMOTE_ONLINE,
					}),
				],
				new Set(),
				hosts,
			);

			expect(result).toEqual([{ id: "sess-remote", projectId: null }]);
		});

		it("skips a worktree on an offline remote host — nobody could open the row", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-offline", {
						hostId: REMOTE_OFFLINE,
						// Rows for an offline host come from the IndexedDB snapshot,
						// so the host never "answered" this session.
						hostReachable: false,
					}),
				],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});

		it("skips an online remote host's rows until that host has actually answered (no placement off a stale snapshot)", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-snapshot", {
						hostId: REMOTE_ONLINE,
						hostReachable: false,
					}),
				],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});

		it("skips a host that presence says is online but whose relay query failed (retained data, isError)", () => {
			// react-query keeps the last good list across a failed refetch; the
			// merge reports hostReachable=false for it, and placement must not
			// treat those retained rows as the host answering.
			const result = selectWorktreesToPlace(
				[worktree("wt-stale", { hostId: REMOTE_ONLINE, hostReachable: false })],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});

		it("skips a host that answered earlier but is offline now (retained rows)", () => {
			// Presence flipped to offline: the disabled query still holds its last
			// list (hostReachable stays true), so the online set is what gates it.
			const result = selectWorktreesToPlace(
				[worktree("wt-gone", { hostId: REMOTE_OFFLINE, hostReachable: true })],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});

		it("still places this device's worktrees even when the local host hasn't answered yet", () => {
			// The local host serves from its snapshot at boot; it was never gated
			// on reachability and must not start being.
			const result = selectWorktreesToPlace(
				[worktree("wt-local-boot", { hostReachable: false })],
				new Set(),
				{ machineId: LOCAL, onlineHostIds: new Set(), currentUserId: ME },
			);

			expect(result).toEqual([{ id: "wt-local-boot", projectId: "p1" }]);
		});

		it("respects a hidden/removed row for a remote worktree just like a local one", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-remote-dismissed", { hostId: REMOTE_ONLINE }),
					worktree("wt-remote-new", { hostId: REMOTE_ONLINE }),
				],
				new Set(["wt-remote-dismissed"]),
				hosts,
			);

			expect(result).toEqual([{ id: "wt-remote-new", projectId: "p1" }]);
		});

		it("skips a teammate's worktree on a shared online host — placement is by creator, not host access", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-theirs", {
						hostId: REMOTE_ONLINE,
						createdByUserId: TEAMMATE,
					}),
					worktree("wt-mine", { hostId: REMOTE_ONLINE }),
				],
				new Set(),
				hosts,
			);

			expect(result).toEqual([{ id: "wt-mine", projectId: "p1" }]);
		});

		it("skips a remote worktree with no recorded creator (host predates the user-id stamp)", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-legacy", {
						hostId: REMOTE_ONLINE,
						createdByUserId: null,
					}),
				],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});

		it("places nothing remote until the session user is known", () => {
			const result = selectWorktreesToPlace(
				[worktree("wt-mine", { hostId: REMOTE_ONLINE })],
				new Set(),
				{ ...hosts, currentUserId: null },
			);

			expect(result).toEqual([]);
		});

		it("still places this device's worktrees whoever created them (local machine is single-user)", () => {
			const result = selectWorktreesToPlace(
				[
					worktree("wt-local-legacy", { createdByUserId: null }),
					worktree("wt-local-other", { createdByUserId: TEAMMATE }),
				],
				new Set(),
				hosts,
			);

			expect(result.map((r) => r.id)).toEqual([
				"wt-local-legacy",
				"wt-local-other",
			]);
		});

		it("ignores rows from a host that is not in the org's host list (e.g. a cloud sandbox's internal id)", () => {
			const result = selectWorktreesToPlace(
				[worktree("wt-sandbox", { hostId: "sandbox-internal-id" })],
				new Set(),
				hosts,
			);

			expect(result).toEqual([]);
		});
	});
});
