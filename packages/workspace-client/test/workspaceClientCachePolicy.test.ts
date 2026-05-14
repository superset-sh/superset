import { describe, expect, test } from "bun:test";
import { getIdleWorkspaceClientEvictionKeys } from "../src/providers/WorkspaceClientProvider/workspaceClientCachePolicy";

describe("workspace client cache policy", () => {
	test("does not evict when the cache is under the limit", () => {
		expect(
			getIdleWorkspaceClientEvictionKeys([
				{ key: "a", activeRefs: 0, lastAccessedAt: 1 },
				{ key: "b", activeRefs: 0, lastAccessedAt: 2 },
			]),
		).toEqual([]);
	});

	test("evicts least recently used idle clients first", () => {
		expect(
			getIdleWorkspaceClientEvictionKeys(
				[
					{ key: "active-old", activeRefs: 1, lastAccessedAt: 1 },
					{ key: "idle-old", activeRefs: 0, lastAccessedAt: 2 },
					{ key: "idle-new", activeRefs: 0, lastAccessedAt: 3 },
					{ key: "protected", activeRefs: 0, lastAccessedAt: 4 },
				],
				2,
				"protected",
			),
		).toEqual(["idle-old", "idle-new"]);
	});
});
