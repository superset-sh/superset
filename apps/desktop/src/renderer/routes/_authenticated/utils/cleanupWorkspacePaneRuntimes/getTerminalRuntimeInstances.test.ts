import { expect, test } from "bun:test";
import { getTerminalRuntimeInstances } from "./getTerminalRuntimeInstances";

test("duplicate pane IDs retain distinct terminal instances across workspaces", () => {
	expect([
		...getTerminalRuntimeInstances(
			["first", "second"].map((workspaceId) => ({
				workspaceId,
				paneLayout: {
					tabs: [
						{
							panes: {
								duplicate: {
									id: "duplicate",
									kind: "terminal",
									data: { terminalId: workspaceId },
								},
							},
						},
					],
				},
			})),
		),
	]).toEqual([
		["duplicate", "first"],
		["duplicate", "second"],
	]);
});

test("shared terminals retain each removed pane instance identity", () => {
	expect([
		...getTerminalRuntimeInstances([
			{
				workspaceId: "removed",
				paneLayout: {
					tabs: [
						{
							panes: {
								a: {
									id: "a",
									kind: "terminal",
									data: { terminalId: "shared" },
								},
								b: {
									id: "b",
									kind: "terminal",
									data: { terminalId: "shared" },
								},
								c: { id: "c", kind: "browser", data: { terminalId: "shared" } },
								d: { id: "d", kind: "terminal", data: null },
							},
						},
					],
				},
			},
			{ workspaceId: "empty", paneLayout: undefined },
		]),
	]).toEqual([
		["a", "shared"],
		["b", "shared"],
	]);
});
