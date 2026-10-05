import { expect, test } from "bun:test";
import type { HostTagFoldersResult } from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import type { ProjectCollectionPendingDelete } from "shared/project-collections";
import {
	replayProjectCollectionDeletes,
	withoutPendingProjectCollections,
} from "./replayProjectCollectionDeletes";

function host(
	machineId: string,
	status: HostTagFoldersResult["status"],
): HostTagFoldersResult {
	return {
		target: {
			machineId,
			organizationId: "org",
			isLocal: false,
			hostUrl: `https://${machineId}.example`,
		},
		status,
		settings: ["projects", "sessions"].map((scope) => ({
			scope,
			tag: "team",
			displayName: "Team",
			color: null,
			tabOrder: 0,
		})),
	};
}

test("pending deletions hide only their host's project settings", () => {
	const hosts = [host("remote", "offline"), host("other", "ready")];
	const result = withoutPendingProjectCollections(hosts, [
		{ machineId: "remote", tag: "team" },
	]);
	expect(result[0]?.settings.map((row) => row.scope)).toEqual(["sessions"]);
	expect(result[1]?.settings.map((row) => row.scope)).toEqual([
		"projects",
		"sessions",
	]);
	expect(hosts[0]?.settings).toHaveLength(2);
});

test("failed and offline deletions remain pending while a successful host is acknowledged", async () => {
	const hosts = [
		host("offline", "offline"),
		host("failed", "ready"),
		host("ready", "ready"),
	];
	let pending: ProjectCollectionPendingDelete[] = hosts.map(({ target }) => ({
		machineId: target.machineId,
		tag: "team",
	}));
	await replayProjectCollectionDeletes({
		hosts,
		pending,
		remove: async (url, tag) => {
			if (url === "https://failed.example") throw new Error("Unavailable");
			if (url === "https://offline.example")
				throw new Error("Offline host was called");
			const ready = hosts[2];
			if (!ready) throw new Error("Missing ready host");
			ready.settings = ready.settings.filter(
				(row) => row.scope !== "projects" || row.tag !== tag,
			);
		},
		acknowledge: async (removed) => {
			pending = pending.filter(
				(row) => row.machineId !== removed.machineId || row.tag !== removed.tag,
			);
		},
	});
	expect(pending).toEqual([
		{ machineId: "offline", tag: "team" },
		{ machineId: "failed", tag: "team" },
	]);
	expect(hosts[2]?.settings.map((row) => row.scope)).toEqual(["sessions"]);
});

test("an acknowledgment failure retries the idempotent host deletion", async () => {
	const hosts = [host("ready", "ready")];
	let pending = [{ machineId: "ready", tag: "team" }];
	let removals = 0;
	const remove = async () => {
		removals++;
	};
	await replayProjectCollectionDeletes({
		hosts,
		pending,
		remove,
		acknowledge: async () => {
			throw new Error("SQLite write failed");
		},
	});
	expect(pending).toHaveLength(1);
	await replayProjectCollectionDeletes({
		hosts,
		pending,
		remove,
		acknowledge: async () => {
			pending = [];
		},
	});
	expect(removals).toBe(2);
	expect(pending).toEqual([]);
});

for (const error of [
	Object.assign(new Error("Invalid scope"), { data: { code: "BAD_REQUEST" } }),
	new Error("No procedure found on path tagFolders.delete"),
]) {
	test(`permanent deletion rejection is acknowledged: ${error.message}`, async () => {
		let pending = [{ machineId: "legacy", tag: "team" }];
		await replayProjectCollectionDeletes({
			hosts: [host("legacy", "ready")],
			pending,
			remove: async () => {
				throw error;
			},
			acknowledge: async () => {
				pending = [];
			},
		});
		expect(pending).toEqual([]);
	});
}

test("a host with a missing folder router discards a previously queued deletion", async () => {
	let pending = [{ machineId: "legacy", tag: "team" }];
	await replayProjectCollectionDeletes({
		hosts: [host("legacy", "error")],
		pending,
		remove: async () => {
			throw new Error("No procedure found on path tagFolders.delete");
		},
		acknowledge: async () => {
			pending = [];
		},
	});
	expect(pending).toEqual([]);
});

test("a deletion replay forwards its original author date", async () => {
	const pending = [{ machineId: "ready", tag: "team", deletedAt: 123 }];
	let removedAt: number | undefined;
	await replayProjectCollectionDeletes({
		hosts: [host("ready", "ready")],
		pending,
		remove: async (_url, _tag, deletedAt) => {
			removedAt = deletedAt;
		},
		acknowledge: async () => {},
	});
	expect(removedAt).toBe(123);
});
test("a superseded deletion is not replayed with its old date", async () => {
	const row = { machineId: "ready", tag: "team", deletedAt: 123 };
	let removed = false;
	await replayProjectCollectionDeletes({
		hosts: [host("ready", "ready")],
		pending: [row],
		readPending: () => [{ ...row, deletedAt: 456 }],
		remove: async () => {
			removed = true;
		},
		acknowledge: async () => {},
	});
	expect(removed).toBe(false);
});

test("a pending deletion does not hide a newer host presentation", () => {
	const ready = host("ready", "ready");
	ready.settings = ready.settings.map((setting) => ({
		...setting,
		updatedAt: 200,
	}));
	expect(
		withoutPendingProjectCollections(
			[ready],
			[{ machineId: "ready", tag: "team", deletedAt: 100 }],
		)[0]?.settings,
	).toHaveLength(2);
	expect(
		withoutPendingProjectCollections(
			[ready],
			[{ machineId: "ready", tag: "team", deletedAt: 200 }],
		)[0]?.settings,
	).toHaveLength(1);
});
