import { afterEach, describe, expect, test } from "bun:test";
import listCommand from "./command";

const WORKSPACE = "b502bf30-8693-4815-be65-795035e0ce5f";

function invoke(options: { workspace?: string; search?: string } = {}) {
	const calls: unknown[] = [];
	const ctx = {
		api: {
			page: {
				list: {
					query: async (input: unknown) => {
						calls.push(input);
						return [];
					},
				},
			},
		},
		config: { organizationId: "org-1" },
		bearer: "bearer",
		authSource: "oauth",
	} as never;
	return listCommand
		.run({
			ctx,
			args: {} as never,
			options: options as never,
			signal: new AbortController().signal,
		})
		.then(() => calls);
}

afterEach(() => {
	delete process.env.SUPERSET_WORKSPACE_ID;
});

describe("pages list", () => {
	// The desktop Pages tab, the MCP tool, and the skill all list the whole org
	// when no workspace is named; an agent looking up a page the user published
	// from somewhere else must see the same set.
	test("lists the whole organization inside a workspace terminal", async () => {
		process.env.SUPERSET_WORKSPACE_ID = WORKSPACE;
		expect(await invoke()).toEqual([{}]);
	});

	test("scopes to a workspace only when one is passed", async () => {
		expect(await invoke({ workspace: WORKSPACE })).toEqual([
			{ workspaceId: WORKSPACE },
		]);
	});

	test("forwards the search text", async () => {
		expect(await invoke({ search: "onboarding" })).toEqual([
			{ search: "onboarding" },
		]);
	});
});
