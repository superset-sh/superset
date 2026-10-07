import { describe, expect, mock, test } from "bun:test";
import {
	applyProjectChangedEvent,
	loadHostProjectsSnapshot,
	mergeHostProjects,
	normalizeHostProjectRow,
	saveHostProjectsSnapshot,
} from "./useHostProjects.utils";

const tagSettings = [
	{
		tag: "api",
		displayName: "API",
		color: "#ff0000",
		tabOrder: null,
	},
];

describe("old-host tag settings compatibility", () => {
	test("normalization preserves project.list tag settings", () => {
		expect(
			normalizeHostProjectRow({
				id: "project",
				repoPath: "/tmp/project",
				tagSettings,
			}).tagSettings,
		).toEqual(tagSettings);
	});

	test("project events keep the last settings when a snapshot omits them", () => {
		const existing = normalizeHostProjectRow({
			id: "project",
			repoPath: "/tmp/project",
			tagSettings,
		});
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: {
					id: "project",
					name: "Renamed",
					repoPath: "/tmp/project",
					repoOwner: null,
					repoName: null,
					repoUrl: null,
					worktreeBaseDir: null,
					icon: null,
					color: null,
					createdAt: 1,
					updatedAt: 2,
				},
			},
			"project",
		);
		expect(next?.[0]?.tagSettings).toEqual(tagSettings);
	});
});

const snapshotBoundary = new Map<string, unknown>();
mock.module("idb-keyval", () => ({
	get: async (key: string) => structuredClone(snapshotBoundary.get(key)),
	set: async (key: string, value: unknown) => {
		snapshotBoundary.set(key, structuredClone(value));
	},
	del: async (key: string) => {
		snapshotBoundary.delete(key);
	},
}));
const nativeInput = {
	id: "native",
	repoPath: "/tmp/local/Widget",
	name: "Native",
	repoProvider: "gitlab",
	repoOwner: "Group/Sub",
	repoName: "Widget",
	repoUrl: "https://git.example.invalid:8443/Group/Sub/Widget",
	createdAt: 1,
	updatedAt: 2,
};
const nativeRow = () => normalizeHostProjectRow(nativeInput);
const target = (machineId: string, isLocal = false) => ({
	machineId,
	isLocal,
	organizationId: "fixture-org",
	hostUrl: null,
});
describe("provider identity delivery", () => {
	test("normalization carries exact native identity and old rows remain unknown", () => {
		expect(nativeRow()).toMatchObject(nativeInput);
		expect(
			normalizeHostProjectRow({ id: "old", repoPath: "/old" }).repoProvider ??
				null,
		).toBeNull();
	});
	test("event carries provider; omission preserves only identical repository tuple", () => {
		const row = nativeRow();
		const nativeSnapshot = { ...row, repoProvider: "gitlab", updatedAt: 3 };
		const created = applyProjectChangedEvent(
			undefined,
			{ eventType: "created", project: nativeSnapshot },
			row.id,
		);
		expect(created?.[0]).toMatchObject({ ...nativeInput, updatedAt: 3 });
		const { repoProvider, ...oldSnapshot } = nativeSnapshot;
		expect(repoProvider).toBe("gitlab");
		const same = applyProjectChangedEvent(
			[row],
			{ eventType: "updated", project: oldSnapshot },
			row.id,
		);
		expect(same?.[0]?.repoProvider).toBe("gitlab");
		for (const change of [
			{ repoUrl: "https://other.invalid/Group/Sub/Widget" },
			{ repoOwner: "Other/Sub" },
			{ repoName: "OtherWidget" },
		]) {
			const changed = applyProjectChangedEvent(
				[row],
				{ eventType: "updated", project: { ...oldSnapshot, ...change } },
				row.id,
			);
			expect(changed?.[0]?.repoProvider ?? null).toBeNull();
			expect(changed?.[0]).toMatchObject(change);
		}
		const cleared = applyProjectChangedEvent(
			[row],
			{
				eventType: "updated",
				project: { ...nativeSnapshot, repoProvider: null },
			},
			row.id,
		);
		expect(cleared?.[0]?.repoProvider).toBeNull();
	});
	test("newest repository identity remains coherent while local physical path still wins", () => {
		const local = { ...nativeRow(), updatedAt: 1 };
		const remote = {
			...nativeRow(),
			repoPath: "/remote/New",
			repoProvider: "github",
			repoOwner: "Other",
			repoName: "New",
			repoUrl: "https://github.com/Other/New",
			updatedAt: 4,
		};
		for (const hostResults of [
			[
				{ target: target("local", true), rows: [local], reachable: true },
				{ target: target("remote"), rows: [remote], reachable: false },
			],
			[
				{ target: target("remote"), rows: [remote], reachable: false },
				{ target: target("local", true), rows: [local], reachable: true },
			],
		])
			expect(mergeHostProjects({ hostResults })[0]).toMatchObject({
				repoPath: local.repoPath,
				repoProvider: "github",
				repoOwner: "Other",
				repoName: "New",
				repoUrl: remote.repoUrl,
				hostReachable: true,
			});
	});
	test("snapshot persistence consumer retains full native identity without new storage key", async () => {
		saveHostProjectsSnapshot("fixture-org", "native-host", [nativeRow()]);
		expect(
			await loadHostProjectsSnapshot("fixture-org", "native-host"),
		).toEqual([nativeRow()]);
		expect(
			snapshotBoundary.get("host-projects:v1:fixture-org:native-host"),
		).toEqual([nativeRow()]);
		expect(
			(await loadHostProjectsSnapshot("fixture-org", "native-host"))?.[0],
		).toMatchObject(nativeInput);
	});
});

test("omitted provider on newest replica preserves an unchanged older identity in either arrival order", () => {
	const known = nativeRow();
	const { repoProvider, ...omitted } = {
		...known,
		updatedAt: known.updatedAt + 1,
	};
	expect(repoProvider).toBe("gitlab");
	for (const rows of [
		[known, omitted],
		[omitted, known],
	])
		expect(
			mergeHostProjects({
				hostResults: rows.map((row, i) => ({
					target: target(`replica-${i}`),
					rows: [row],
					reachable: true,
				})),
			})[0]?.repoProvider,
		).toBe("gitlab");
	const cleared = { ...omitted, repoProvider: null };
	expect(
		mergeHostProjects({
			hostResults: [
				{ target: target("new"), rows: [cleared], reachable: true },
				{ target: target("old"), rows: [known], reachable: true },
			],
		})[0]?.repoProvider,
	).toBeNull();
});
