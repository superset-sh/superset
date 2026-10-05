import { expect, test } from "bun:test";
import type { HostTagFoldersResult } from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import type { ProjectCollectionPendingPresentation } from "shared/project-collections";
import { enqueueProjectCollectionMutation } from "../../projectCollectionMutations";
import {
	replayProjectCollectionPresentations,
	withPendingProjectCollectionPresentations,
} from "./replayProjectCollectionPresentations";

const hosts: HostTagFoldersResult[] = [
	"old",
	"failing",
	"ready",
	"offline",
].map((machineId) => ({
	target: {
		machineId,
		organizationId: "org",
		hostUrl: machineId,
		isLocal: false,
	},
	status: machineId === "offline" ? "offline" : "ready",
	settings: [],
}));
const entry = (
	machineId: string,
	tag = "team",
): ProjectCollectionPendingPresentation => ({
	machineId,
	tag,
	setting: {
		scope: "projects",
		updatedAt: 100,
		create: true,
		tag,
		displayName: "New",
		color: null,
		tabOrder: 0,
	},
});

test("unsupported and transient hosts do not starve later hosts", async () => {
	let pending = [
		entry("old"),
		entry("old", "second"),
		entry("failing"),
		entry("failing", "second"),
		entry("ready"),
		entry("ready", "second"),
		entry("offline"),
	];
	const calls: string[] = [];
	const invalidations: string[] = [];
	await replayProjectCollectionPresentations({
		hosts,
		pending,
		readPending: () => pending,
		enqueue: (work) => enqueueProjectCollectionMutation("replay", work),
		upsert: async (host) => {
			calls.push(host.target.machineId);
			if (host.target.machineId === "old")
				throw { data: { code: "BAD_REQUEST" } };
			if (host.target.machineId === "failing") throw new Error("Disconnected");
		},
		acknowledge: async (row) => {
			pending = pending.filter((entry) => entry !== row);
		},
		invalidate: (host) => {
			invalidations.push(host.target.machineId);
		},
	});
	expect(calls).toEqual(["old", "failing", "ready", "ready"]);
	expect(pending.map((row) => row.machineId)).toEqual([
		"failing",
		"failing",
		"offline",
	]);
	expect(invalidations).toEqual(["ready"]);
});

test("one replay write yields to user mutations and skips superseded entries", async () => {
	const first = entry("ready");
	const second = entry("ready", "second");
	let pending = [first, second];
	const calls: string[] = [];
	let release!: () => void;
	let started!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const writing = new Promise<void>((resolve) => {
		started = resolve;
	});
	const replay = replayProjectCollectionPresentations({
		hosts,
		pending,
		readPending: () => pending,
		enqueue: (work) => enqueueProjectCollectionMutation("yield", work),
		upsert: async (_host, row) => {
			calls.push(row.tag);
			started();
			await gate;
		},
		acknowledge: async (row) => {
			pending = pending.filter((entry) => entry !== row);
		},
		invalidate: () => {},
	});
	await writing;
	const user = enqueueProjectCollectionMutation("yield", async () => {
		calls.push("user");
		pending = [];
	});
	release();
	await Promise.all([replay, user]);
	expect(calls).toEqual(["team", "user"]);
});

for (const error of [
	new Error('No procedure found on path "tagFolders.upsert"'),
	{ data: { code: "BAD_REQUEST" }, message: "scope must be sessions or uuid" },
]) {
	test("definitive presentation refusals are acknowledged", async () => {
		const pending = [entry("old")];
		const acknowledged: ProjectCollectionPendingPresentation[] = [];
		await replayProjectCollectionPresentations({
			hosts,
			pending,
			readPending: () => pending,
			enqueue: (work) => work(),
			upsert: async () => {
				throw error;
			},
			acknowledge: async (row) => {
				acknowledged.push(row);
			},
			invalidate: () => {
				throw new Error("No successful write");
			},
		});
		expect(acknowledged).toEqual(pending);
	});
}

test("a missing router on an error host discards the author presentation", async () => {
	const host = hosts[0];
	if (!host) throw new Error("Missing host");
	const pending = [entry(host.target.machineId)];
	let acknowledged = false;
	await replayProjectCollectionPresentations({
		hosts: [{ ...host, status: "error" }],
		pending,
		readPending: () => pending,
		enqueue: (work) => work(),
		upsert: async () => {
			throw new Error("No procedure found on path tagFolders.upsert");
		},
		acknowledge: async () => {
			acknowledged = true;
		},
		invalidate: () => {},
	});
	expect(acknowledged).toBe(true);
});

for (const current of ["newer", "deleted"] as const) {
	test(`replay lets the host settle a ${current} presentation`, async () => {
		const row = entry("ready");
		Object.assign(row.setting, { updatedAt: 10, create: false });
		if (!hosts[2]) throw new Error("Missing host");
		const host = {
			...hosts[2],
			settings:
				current === "deleted"
					? []
					: [{ ...row.setting, displayName: "Newer", updatedAt: 20 }],
		};
		let calls = 0;
		let acknowledged = false;
		await replayProjectCollectionPresentations({
			hosts: [host],
			pending: [row],
			readPending: () => [row],
			enqueue: (work) => work(),
			upsert: async () => {
				calls++;
			},
			acknowledge: async () => {
				acknowledged = true;
			},
			invalidate: () => {},
		});
		expect(calls).toBe(1);
		expect(acknowledged).toBe(true);
	});
}

test("D4 acknowledgements cannot reset host retry backoff", async () => {
	const retries = new Map<string, { attempts: number; retryAt: number }>();
	const row = entry("failing");
	let time = 0;
	let calls = 0;
	const replay = () =>
		replayProjectCollectionPresentations({
			hosts,
			pending: [row],
			readPending: () => [row],
			enqueue: (work) => work(),
			retries,
			now: () => time,
			upsert: async () => {
				calls++;
				throw new Error("Transient");
			},
			acknowledge: async () => {},
			invalidate: () => {},
		});
	await replay();
	await replay();
	expect(calls).toBe(1);
	expect(retries.get("failing")?.retryAt).toBe(1000);
	time = 1000;
	await replay();
	expect(calls).toBe(2);
	expect(retries.get("failing")?.retryAt).toBe(3000);
	for (let index = 0; index < 10; index++) {
		time = retries.get("failing")?.retryAt ?? -1;
		await replay();
	}
	expect((retries.get("failing")?.retryAt ?? -1) - time).toBe(60_000);
});

test("pending presentation never hides a newer host or recreates its absent row", () => {
	const row = entry("ready");
	row.setting.create = false;
	if (!hosts[2]) throw new Error("Missing host");
	const empty = { ...hosts[2], settings: [] };
	const newer = {
		...empty,
		settings: [{ ...row.setting, displayName: "Newer", updatedAt: 200 }],
	};
	expect(
		withPendingProjectCollectionPresentations([empty], [row])[0]?.settings,
	).toEqual([]);
	expect(
		withPendingProjectCollectionPresentations([newer], [row])[0]?.settings[0]
			?.displayName,
	).toBe("Newer");
});
test("an undated pre-upgrade queued edit is discarded rather than replayed destructively", async () => {
	const row = entry("ready");
	delete row.setting.updatedAt;
	let calls = 0;
	let acknowledgements = 0;
	await replayProjectCollectionPresentations({
		hosts,
		pending: [row],
		readPending: () => [row],
		enqueue: (work) => work(),
		upsert: async () => {
			calls++;
		},
		acknowledge: async () => {
			acknowledgements++;
		},
		invalidate: () => {},
	});
	expect(calls).toBe(0);
	expect(acknowledgements).toBe(1);
});

test("an acknowledgement failure is retried with backoff instead of being forgotten", async () => {
	const row = entry("ready");
	const retries = new Map<string, { attempts: number; retryAt: number }>();
	let time = 0;
	let attempts = 0;
	const replay = () =>
		replayProjectCollectionPresentations({
			hosts,
			pending: [row],
			readPending: () => [row],
			enqueue: (work) => work(),
			retries,
			now: () => time,
			upsert: async () => {},
			acknowledge: async () => {
				attempts++;
				throw new Error("SQLite unavailable");
			},
			invalidate: () => {},
		});
	await replay();
	await replay();
	expect(attempts).toBe(1);
	time = 1000;
	await replay();
	expect(attempts).toBe(2);
});

test("replay writes when a move has copied the pending presentation into the host cache", async () => {
	const row = entry("ready");
	const host = hosts[2];
	if (!host) throw new Error("Missing host");
	const overlaid = withPendingProjectCollectionPresentations([host], [row])[0];
	if (!overlaid) throw new Error("Missing overlay");
	let storedName = "Old";
	let acknowledged = false;
	await replayProjectCollectionPresentations({
		hosts: [host],
		pending: [row],
		readPending: () => [row],
		readHost: () => overlaid,
		enqueue: (work) => work(),
		upsert: async (_host, pending) => {
			storedName = pending.setting.displayName ?? "";
		},
		acknowledge: async () => {
			acknowledged = true;
		},
		invalidate: () => {},
	});
	expect(storedName).toBe("New");
	expect(acknowledged).toBe(true);
});
