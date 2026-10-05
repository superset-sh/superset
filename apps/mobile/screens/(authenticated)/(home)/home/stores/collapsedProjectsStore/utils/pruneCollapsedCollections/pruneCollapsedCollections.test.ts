import { expect, test } from "bun:test";
import { pruneCollapsedCollections } from "./pruneCollapsedCollections";

test("purges only unknown collection keys on the selected host", () => {
	const collapsed = {
		"host-a:projects:old": true,
		"host-a:projects:kept": true,
		"host-a:project-id": true,
		"host-a:__none": true,
		"host-b:projects:old": true,
	} as const;
	expect(pruneCollapsedCollections(collapsed, "host-a", ["kept"])).toEqual({
		"host-a:projects:kept": true,
		"host-a:project-id": true,
		"host-a:__none": true,
		"host-b:projects:old": true,
	});
	expect(collapsed["host-a:projects:old"]).toBe(true);
});

test("retains the same state when no collection key is stale", () => {
	const collapsed = {
		"host:projects:team": true,
		"host:project": true,
	} as const;
	expect(pruneCollapsedCollections(collapsed, "host", ["team"])).toBe(
		collapsed,
	);
});
