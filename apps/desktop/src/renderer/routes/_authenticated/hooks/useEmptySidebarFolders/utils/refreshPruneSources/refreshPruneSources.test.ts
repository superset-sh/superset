import { describe, expect, it, mock } from "bun:test";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { refreshPruneSources } from "./refreshPruneSources";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const restored: FindOrphanedTagFoldersInput = {
	sections: [
		{
			sectionId: `${PROJECT}:perf`,
			projectId: PROJECT,
			name: "perf",
			tag: "perf",
		},
	],
	workspaces: [],
	hostReads: [
		{ isLocal: true, live: true, projectIds: [PROJECT], projectsLive: true },
	],
	rosterLive: false,
	cloudLive: true,
	hiddenTagsByProject: new Map(),
	sessionsSettingHostKnown: true,
};

const TIMING = { timeoutMs: 50, settleMs: 30, pollMs: 2 };

function setup(roster: () => Promise<unknown>) {
	let latest = restored;
	const refetch = {
		roster: mock(async () => {
			await roster();
			latest = { ...latest, rosterLive: true };
		}),
		cloud: mock(async () => {}),
		hosts: mock(async () => {}),
	};
	return { refetch, readLatest: () => latest };
}

describe("refreshPruneSources", () => {
	it("refetches a roster restored from the cache, then the prune proceeds", async () => {
		const { refetch, readLatest } = setup(async () => {});
		const input = await refreshPruneSources({
			current: restored,
			readLatest,
			refetch,
			...TIMING,
		});
		expect(refetch.roster).toHaveBeenCalledTimes(1);
		expect(refetch.cloud).not.toHaveBeenCalled();
		expect(refetch.hosts).not.toHaveBeenCalled();
		expect(
			findOrphanedTagFolders(input).orphaned.map(({ tag }) => tag),
		).toEqual(["perf"]);
	});

	it.each([
		["fails", () => Promise.reject(new Error("offline"))],
		["times out", () => new Promise<never>(() => {})],
	])("still skips when the roster refetch %s", async (_name, roster) => {
		const { refetch, readLatest } = setup(roster);
		const input = await refreshPruneSources({
			current: restored,
			readLatest,
			refetch,
			...TIMING,
		});
		const result = findOrphanedTagFolders(input);
		expect(result.orphaned).toEqual([]);
		expect(result.unverified.map(({ reason }) => reason)).toEqual([
			"unanswered",
		]);
	});

	it("refetches nothing when every source is already live", async () => {
		const live = { ...restored, rosterLive: true };
		const { refetch } = setup(async () => {});
		expect(
			await refreshPruneSources({
				current: live,
				readLatest: () => live,
				refetch,
				...TIMING,
			}),
		).toBe(live);
		expect(refetch.roster).not.toHaveBeenCalled();
	});

	it("waits for refetched host reads to reach a render before deciding", async () => {
		const staleHost: FindOrphanedTagFoldersInput = {
			...restored,
			rosterLive: true,
			hostReads: [
				{
					isLocal: true,
					live: false,
					projectIds: [PROJECT],
					projectsLive: true,
				},
			],
		};
		let latest = staleHost;
		const refetch = {
			roster: mock(async () => {}),
			cloud: mock(async () => {}),
			hosts: mock(async () => {
				// The fetch resolves first; React renders its data a little later.
				setTimeout(() => {
					latest = { ...staleHost, hostReads: restored.hostReads };
				}, 5);
			}),
		};
		const input = await refreshPruneSources({
			current: staleHost,
			readLatest: () => latest,
			refetch,
			...TIMING,
		});
		expect(
			findOrphanedTagFolders(input).orphaned.map(({ tag }) => tag),
		).toEqual(["perf"]);
	});

	it("refetches hosts whose workspace or project read is not live", async () => {
		const { refetch, readLatest } = setup(async () => {});
		await refreshPruneSources({
			current: {
				...restored,
				rosterLive: true,
				hostReads: [
					{ isLocal: true, live: true, projectIds: null, projectsLive: false },
				],
			},
			readLatest,
			refetch,
			...TIMING,
		});
		expect(refetch.hosts).toHaveBeenCalledTimes(1);
		expect(refetch.roster).not.toHaveBeenCalled();
	});
});
