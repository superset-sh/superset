import { expect, mock, test } from "bun:test";

const data = new Map<string, unknown>();
const reads: string[] = [];
mock.module("idb-keyval", () => ({
	get: async (key: string) => {
		reads.push(key);
		return data.get(key);
	},
	set: async (key: string, value: unknown) => {
		data.set(key, value);
	},
	del: async (key: string) => {
		data.delete(key);
	},
}));
const {
	loadHostProjectsSnapshot,
	saveHostProjectsSnapshot,
	removeFromHostProjectsSnapshot,
	normalizeHostProjectRow,
} = await import("../useHostProjects.utils");

test("personal snapshots and removals are isolated by user", async () => {
	const alice = normalizeHostProjectRow({
		id: "project",
		repoPath: "/project",
		tags: ["private"],
	});
	const bob = { ...alice, tags: ["bob"] };
	saveHostProjectsSnapshot("org", "remote", "alice", [alice]);
	saveHostProjectsSnapshot("org", "remote", "bob", [bob]);
	expect(
		(await loadHostProjectsSnapshot("org", "remote", "alice"))?.[0]?.tags,
	).toEqual(["private"]);
	expect(
		(await loadHostProjectsSnapshot("org", "remote", "bob"))?.[0]?.tags,
	).toEqual(["bob"]);
	expect(data.has("host-projects:v2:org:alice:remote")).toBe(true);
	await removeFromHostProjectsSnapshot("org", "remote", "bob", "project");
	expect(await loadHostProjectsSnapshot("org", "remote", "bob")).toEqual([]);
	expect(await loadHostProjectsSnapshot("org", "remote", "alice")).toHaveLength(
		1,
	);
});

test("anonymous reads never hydrate another user's snapshot or the legacy snapshot", async () => {
	data.set("host-projects:v1:org:remote", [
		{ id: "legacy", repoPath: "/legacy", tags: ["private"] },
	]);
	expect(await loadHostProjectsSnapshot("org", "remote", "")).toBeUndefined();
	expect(
		await loadHostProjectsSnapshot("org", "remote", "new-user"),
	).toBeUndefined();
});

test("snapshot loading deletes its legacy key without reading personal tags", async () => {
	data.set("host-projects:v1:org:remote", [
		{ id: "legacy", repoPath: "/legacy", tags: ["private"] },
	]);
	await loadHostProjectsSnapshot("org", "remote", "new-user");
	expect(data.has("host-projects:v1:org:remote")).toBe(false);
	expect(reads).not.toContain("host-projects:v1:org:remote");
});
