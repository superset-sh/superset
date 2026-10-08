import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import createWorkspaceCommand from "./command";

let localCreateError: Error | undefined;
let createProcedure: string | undefined;
let createInput: Record<string, unknown> | undefined;
let sessionInput: Record<string, unknown> | undefined;

let cloudAvailable = false;

withLocalHostService("org-1", {
	"workspaces.createLocal": (input) => {
		createProcedure = "createLocal";
		if (localCreateError) throw localCreateError;
		createInput = input;
		return { workspace: { name: "local" }, alreadyExists: false };
	},
	"workspaces.createSession": (input) => {
		sessionInput = input;
		return { workspace: { name: "scratch" } };
	},
	"workspaces.create": (input) => {
		createProcedure = "create";
		createInput = input;
		return { workspace: { name: "agent-effort" }, alreadyExists: false };
	},
});

function invoke(
	overrides: {
		agent?: string;
		prompt?: string;
		effort?: string;
		tag?: string[];
		project?: string | undefined;
		session?: boolean;
		local?: boolean;
		branch?: string | undefined;
		model?: string;
		checkout?: string;
		pr?: number;
	} = {},
) {
	return createWorkspaceCommand.run({
		ctx: {
			api: {
				cloudWorkspace: {
					available: { query: async () => ({ available: cloudAvailable }) },
				},
			},
			config: { organizationId: "org-1" },
			bearer: "bearer",
		} as never,
		args: {} as never,
		options: {
			local: true,
			project: "project-1",
			name: "agent-effort",
			branch: "agent/effort",
			...overrides,
		} as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	cloudAvailable = false;
	createInput = undefined;
	createProcedure = undefined;
	localCreateError = undefined;
	sessionInput = undefined;
});

describe("workspaces create", () => {
	for (const session of [undefined, false]) {
		test(`rejects missing project when session is ${session}`, async () => {
			await expect(
				invoke({ project: undefined, branch: undefined, session }),
			).rejects.toThrow(/Specify --project or --session/);
			expect(createInput).toBeUndefined();
			expect(sessionInput).toBeUndefined();
		});
	}

	test("rejects --session with --project", async () => {
		await expect(invoke({ session: true })).rejects.toThrow(
			/--session cannot be combined with --project/,
		);
		expect(createInput).toBeUndefined();
		expect(sessionInput).toBeUndefined();
	});

	test("rejects --session when the account's default location is the cloud", async () => {
		cloudAvailable = true;
		await expect(
			invoke({ project: undefined, session: true, local: false }),
		).rejects.toThrow(/--session does not apply to a cloud workspace/);
		expect(createInput).toBeUndefined();
		expect(sessionInput).toBeUndefined();
	});

	test("creates a session only with explicit --session", async () => {
		await invoke({ project: undefined, branch: undefined, session: true });
		expect(sessionInput).toMatchObject({ name: "agent-effort" });
		expect(createInput).toBeUndefined();
	});

	test("forwards model to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			model: "sonnet",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					model: "sonnet",
				},
			],
		});
	});

	test("forwards effort to the agent launched with the workspace", async () => {
		await invoke({
			agent: "claude",
			prompt: "Implement the feature",
			effort: "high",
		});

		expect(createInput).toMatchObject({
			agents: [
				{
					agent: "claude",
					prompt: "Implement the feature",
					effort: "high",
				},
			],
		});
	});

	test("rejects effort when no agent is selected", async () => {
		await expect(invoke({ effort: "high" })).rejects.toThrow(
			/--effort requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});

	test("forwards repeatable --tag values as the tags set", async () => {
		await invoke({ tag: ["Perf Work", "infra"] });
		expect(createInput).toMatchObject({ tags: ["Perf Work", "infra"] });
	});

	test("omits tags entirely when --tag is not passed", async () => {
		await invoke();
		expect(createInput).not.toHaveProperty("tags");
	});

	test("rejects --tag on a project-less session", async () => {
		await expect(
			invoke({
				project: undefined,
				session: true,
				branch: undefined,
				tag: ["perf"],
			}),
		).rejects.toThrow(/--tag requires --project/);
		expect(createInput).toBeUndefined();
	});

	test("rejects model when no agent is selected", async () => {
		await expect(invoke({ model: "sonnet" })).rejects.toThrow(
			/--model requires --agent/,
		);
		expect(createInput).toBeUndefined();
	});

	test("--checkout local sends the local checkout and no branch", async () => {
		await invoke({ checkout: "local", branch: undefined });
		expect(createProcedure).toBe("createLocal");
		expect(createInput?.checkout).toBe("local");
		expect(createInput?.branch).toBeUndefined();
	});

	test("does not fall back to worktree creation when an older host lacks local creation", async () => {
		localCreateError = new Error(
			"No procedure found on path workspaces.createLocal",
		);
		await expect(
			invoke({ checkout: "local", branch: undefined }),
		).rejects.toThrow("No procedure found");
		expect(createProcedure).toBe("createLocal");
		expect(createInput).toBeUndefined();
	});

	test("omits checkout entirely for the default worktree create", async () => {
		await invoke();
		expect(createProcedure).toBe("create");
		expect(createInput).not.toHaveProperty("checkout");
	});

	test("rejects --branch alongside --checkout local", async () => {
		await expect(invoke({ checkout: "local" })).rejects.toThrow(
			/cannot be combined with --checkout local/,
		);
	});

	test("rejects --pr alongside --checkout local", async () => {
		await expect(
			invoke({ checkout: "local", branch: undefined, pr: 12 }),
		).rejects.toThrow(/cannot be combined with --checkout local/);
	});

	test("rejects an unknown --checkout value", async () => {
		await expect(invoke({ checkout: "clone" })).rejects.toThrow(
			/Unknown checkout/,
		);
	});

	test("rejects --checkout on a project-less session", async () => {
		await expect(
			invoke({
				checkout: "local",
				project: undefined,
				branch: undefined,
				session: true,
			}),
		).rejects.toThrow(/--checkout requires --project/);
	});
});
