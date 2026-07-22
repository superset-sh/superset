import { describe, expect, mock, test } from "bun:test";

// The command resolves a host target through the lib barrel. Mock it so we can
// feed a host project list without spinning up a real host service.
let hostProjects: Array<Record<string, unknown>> = [];
const hostReachable = true;

mock.module("../../../lib/host-target", () => ({
	resolveHostFilter: () => undefined,
	resolveHostTarget: () => {
		if (!hostReachable) throw new Error("host unreachable");
		return {
			kind: "local" as const,
			hostId: "host-1",
			client: {
				project: { list: { query: async () => hostProjects } },
			},
		};
	},
}));

const { default: listCommand } = await import("./command");

function makeCtx(cloudProjects: Array<Record<string, unknown>>) {
	return {
		api: { v2Project: { list: { query: async () => cloudProjects } } },
		config: { organizationId: "org-1" },
		bearer: "bearer",
		authSource: "oauth",
	} as never;
}

function invoke(cloudProjects: Array<Record<string, unknown>>) {
	return listCommand.run({
		ctx: makeCtx(cloudProjects),
		args: {} as never,
		options: {} as never,
		signal: new AbortController().signal,
	}) as Promise<Array<Record<string, unknown>>>;
}

describe("projects list", () => {
	// Repro for #5866: `superset projects create --local --import <path>` makes a
	// local-first project that lives only in the host DB — the cloud never learns
	// about it. `projects list` must still surface it (the desktop UI does), or
	// the user sees "No results." right after a successful create.
	test("shows local-first host projects the cloud has never heard of", async () => {
		hostProjects = [
			{
				id: "11111111-1111-1111-1111-111111111111",
				name: "my-project",
				repoPath: "/home/me/Sites/my-project",
				repoUrl: null,
			},
		];
		const rows = await invoke([]); // cloud list is empty

		expect(rows).toHaveLength(1);
		expect(rows[0]!.id).toBe("11111111-1111-1111-1111-111111111111");
		expect(rows[0]!.name).toBe("my-project");
		expect(rows[0]!.path).toBe("/home/me/Sites/my-project");
		expect(rows[0]!.setUp).toBe("yes");
	});

	test("does not duplicate a project that lives in both cloud and host", async () => {
		const id = "22222222-2222-2222-2222-222222222222";
		hostProjects = [
			{ id, name: "shared", repoPath: "/home/me/shared", repoUrl: null },
		];
		const rows = await invoke([{ id, name: "shared", slug: "shared" }]);

		expect(rows).toHaveLength(1);
		expect(rows[0]!.setUp).toBe("yes");
		expect(rows[0]!.path).toBe("/home/me/shared");
	});
});
