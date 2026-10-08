import { describe, expect, test } from "bun:test";
import { executeTool, type ToolContext } from "./executeTool";
import {
	type VoiceData,
	VoiceDataError,
	type VoiceSessionRow,
	type VoiceWorkspace,
} from "./types";

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const workspaces: VoiceWorkspace[] = [
	{
		id: "ws-auth",
		name: "auth-refactor",
		kind: "cloud",
		organizationId: "org",
		hostId: "ws-auth",
		hostName: null,
		branch: "auth-refactor",
		project: "superset/superset",
		status: "ready",
		attention: "review",
		attentionAt: NOW - 3 * MIN,
		lastActivityAt: NOW - 3 * MIN,
		createdByMe: true,
	},
	{
		id: "ws-dash",
		name: "dashboard-v2",
		kind: "host",
		organizationId: "org",
		hostId: "mac",
		hostName: "Satya's Mac",
		branch: "dash",
		project: "superset",
		status: "ready",
		attention: "working",
		attentionAt: NOW - 10 * MIN,
		lastActivityAt: NOW - 10 * MIN,
		createdByMe: true,
	},
	{
		id: "ws-old",
		name: "old-experiment",
		kind: "host",
		organizationId: "org",
		hostId: "mac",
		hostName: "Satya's Mac",
		branch: "old",
		project: "superset",
		status: "ready",
		attention: null,
		attentionAt: null,
		lastActivityAt: NOW - 3 * 24 * 60 * MIN,
		createdByMe: true,
	},
];

const sessions: VoiceSessionRow[] = [
	{
		terminalId: "t-claude",
		workspaceId: "ws-auth",
		title: "claude",
		agentId: "claude",
		attention: "review",
		lastEventAt: NOW - 3 * MIN,
		createdAt: NOW - 60 * MIN,
	},
];

function fakeData(overrides: Partial<VoiceData> = {}): VoiceData & {
	sent: string[];
} {
	const sent: string[] = [];
	return {
		sent,
		listWorkspaces: async () => workspaces,
		listSessions: async (workspace) =>
			workspace.id === "ws-auth" ? sessions : [],
		readTranscript: async () => "● Opened PR #8102\n\nWhich do you prefer?",
		sendMessage: async (_workspace, session, text) => {
			sent.push(`${session.terminalId}:${text}`);
		},
		listPullRequests: async () => [
			{
				number: 8102,
				title: "refactor(auth)",
				state: "open",
				url: "u",
				isCurrent: true,
			},
		],
		listPages: async () => [],
		findPage: async (query) =>
			query.includes("usage")
				? {
						id: "p1",
						slug: "usage-v2",
						title: "Usage dashboard v2",
						description: null,
						updatedAt: NOW - 9 * MIN,
					}
				: null,
		restartWorkspace: async () => {},
		readPage: async () => "Usage is up 12% this week.",
		listEnvironments: async () => [
			{ id: "env-1", name: "Superset" },
			{ id: "env-2", name: "Docs site" },
		],
		createWorkspace: async () => ({ id: "ws-new", name: "Fix login" }),
		listMachines: async () => [
			{
				hostId: "host-1",
				name: "satyas-mbp",
				projects: [
					{ id: "proj-1", name: "superset" },
					{ id: "proj-2", name: "docs" },
				],
			},
		],
		createMachineWorkspace: async ({ machine, projectId }) => ({
			workspace: {
				...workspaces[0],
				id: "ws-scratch",
				name: projectId ? "local" : "New session",
				hostId: machine.hostId,
			},
			terminalId: "t-new",
		}),
		startAgent: async () => ({ terminalId: "t-new", label: "claude" }),
		stopSession: async () => {},
		createTask: async (input) => ({
			key: "SUP-1",
			title: input.title,
			status: null,
			priority: input.priority,
			assignee: null,
		}),
		listTasks: async () => [],
		...overrides,
	};
}

function context(data: VoiceData, pathname = "/") {
	let endRequests = 0;
	const watched: string[] = [];
	const ctx: ToolContext = {
		data,
		now: () => NOW,
		endSession: () => {
			endRequests++;
		},
		getPathname: () => pathname,
		watchSession: (_workspace, terminalId) => {
			watched.push(terminalId);
		},
	};
	return { ctx, endRequests: () => endRequests, watched };
}

describe("executeTool", () => {
	test("list_workspaces shapes active rows for speech and points home", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool("list_workspaces", {}, ctx);
		const output = result.output as {
			workspaces: Array<{
				name: string;
				agent: string;
				since: string;
				where: string;
			}>;
			matching: number;
			total: number;
		};
		expect(output.workspaces.map((w) => w.name)).toEqual([
			"auth-refactor",
			"dashboard-v2",
		]);
		expect(output.workspaces[0]).toMatchObject({
			agent: "finished, waiting for the user to look",
			since: "3 minutes ago",
			where: "cloud",
		});
		expect(output.workspaces[1]?.where).toBe("Satya's Mac");
		expect(output.matching).toBe(2);
		expect(output.total).toBe(3);
		expect(result.ui?.navigate).toEqual({ screen: "home" });
	});

	test("get_workspace resolves a fragment and navigates to it", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"get_workspace",
			{ query: "the auth one" },
			ctx,
		);
		expect(result.output).toMatchObject({
			workspace: { name: "auth-refactor" },
			sessions: [{ name: "claude", agent: "claude" }],
			pullRequests: [{ number: 8102, state: "open" }],
		});
		expect(result.ui?.navigate).toEqual({
			screen: "workspace",
			workspaceId: "ws-auth",
		});
	});

	test("an unknown workspace is a typed error, not a throw", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"get_workspace",
			{ query: "marketing" },
			ctx,
		);
		expect(result.output).toEqual({
			error: {
				kind: "not_found",
				message: 'No workspace matches "marketing".',
			},
		});
		expect(result.ui).toBeUndefined();
	});

	test("read_session hands back the transcript and selects the tab", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"read_session",
			{ workspace: "auth-refactor" },
			ctx,
		);
		expect(result.output).toMatchObject({
			session: { name: "claude" },
			transcript: expect.stringContaining("Which do you prefer?"),
		});
		expect(result.ui?.navigate).toEqual({
			screen: "workspace",
			workspaceId: "ws-auth",
			terminalId: "t-claude",
		});
	});

	test("an unreachable host surfaces as unreachable", async () => {
		const { ctx } = context(
			fakeData({
				listSessions: async () => {
					throw new VoiceDataError("unreachable", "Could not reach the host.");
				},
			}),
		);
		const result = await executeTool(
			"list_sessions",
			{ workspace: "auth" },
			ctx,
		);
		expect(result.output).toEqual({
			error: { kind: "unreachable", message: "Could not reach the host." },
		});
	});

	test("send_message sends at once and points at the session", async () => {
		const data = fakeData();
		const { ctx } = context(data);
		const result = await executeTool(
			"send_message",
			{ workspace: "auth", text: "Yes, migrate it too." },
			ctx,
		);
		expect(result.output).toMatchObject({ sent: true, session: "claude" });
		expect(data.sent).toEqual(["t-claude:Yes, migrate it too."]);
	});

	test("create_workspace defaults to a scratch workspace on the machine and watches the agent", async () => {
		const created: Array<string | null> = [];
		const base = fakeData();
		const { ctx, watched } = context({
			...base,
			createMachineWorkspace: async (input) => {
				created.push(input.projectId);
				return base.createMachineWorkspace(input);
			},
		});
		const result = await executeTool(
			"create_workspace",
			{ prompt: "Research how Linear does cycles" },
			ctx,
		);
		expect(created).toEqual([null]);
		expect(watched).toEqual(["t-new"]);
		expect(result.output).toMatchObject({ created: true, where: "satyas-mbp" });
		expect(result.ui).toEqual({
			navigate: {
				screen: "workspace",
				workspaceId: "ws-scratch",
				terminalId: "t-new",
			},
		});
	});

	test("create_workspace with a project uses that project's checkout", async () => {
		const created: Array<string | null> = [];
		const base = fakeData();
		const { ctx } = context({
			...base,
			createMachineWorkspace: async (input) => {
				created.push(input.projectId);
				return base.createMachineWorkspace(input);
			},
		});
		const result = await executeTool(
			"create_workspace",
			{ prompt: "Fix the typo", project: "docs" },
			ctx,
		);
		expect(created).toEqual(["proj-2"]);
		expect(result.output).toMatchObject({ project: "docs" });
	});

	test("create_workspace in the cloud asks which environment when several exist", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"create_workspace",
			{ prompt: "Fix the login bug", cloud: true },
			ctx,
		);
		expect(result.output).toMatchObject({
			error: { kind: "ambiguous", environments: ["Superset", "Docs site"] },
		});
		expect(result.ui).toBeUndefined();
	});

	test("create_workspace in the cloud resolves a spoken environment", async () => {
		const created: string[] = [];
		const { ctx } = context(
			fakeData({
				createWorkspace: async (input) => {
					created.push(`${input.environmentId}:${input.agent}:${input.prompt}`);
					return { id: "ws-new", name: "Fix login" };
				},
			}),
		);
		const result = await executeTool(
			"create_workspace",
			{ prompt: "Fix the login bug", environment: "docs", cloud: true },
			ctx,
		);
		expect(created).toEqual(["env-2:claude:Fix the login bug"]);
		expect(result.ui).toEqual({
			navigate: { screen: "workspace", workspaceId: "ws-new" },
		});
	});

	test("start_agent opens the new session in its workspace", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"start_agent",
			{ workspace: "auth", prompt: "Add tests" },
			ctx,
		);
		expect(result.output).toMatchObject({ started: true, session: "claude" });
		expect(result.ui).toEqual({
			navigate: {
				screen: "workspace",
				workspaceId: "ws-auth",
				terminalId: "t-new",
			},
		});
	});

	test("stop_agent closes the most recent session", async () => {
		const stopped: string[] = [];
		const { ctx } = context(
			fakeData({
				stopSession: async (_workspace, session) => {
					stopped.push(session.terminalId);
				},
			}),
		);
		const result = await executeTool("stop_agent", { workspace: "auth" }, ctx);
		expect(stopped).toEqual(["t-claude"]);
		expect(result.output).toMatchObject({ stopped: true, session: "claude" });
	});

	test("read_page reads the page on screen when none is named", async () => {
		const { ctx } = context(fakeData(), "/pages/usage-v2");
		const result = await executeTool("read_page", {}, ctx);
		expect(result.output).toMatchObject({
			page: { title: "Usage dashboard v2" },
			text: "Usage is up 12% this week.",
		});
	});

	test("read_page with nothing open and nothing named asks which", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool("read_page", {}, ctx);
		expect(result.output).toMatchObject({ error: { kind: "invalid" } });
	});

	test("restart refuses a host workspace", async () => {
		const { ctx } = context(fakeData());
		const result = await executeTool(
			"restart_workspace",
			{ workspace: "dashboard" },
			ctx,
		);
		expect((result.output as { error: { kind: string } }).error.kind).toBe(
			"invalid",
		);
	});

	test("show resolves pages and workspaces into directives", async () => {
		const { ctx } = context(fakeData());
		const page = await executeTool(
			"show",
			{ screen: "page", page: "usage" },
			ctx,
		);
		expect(page.ui?.navigate).toEqual({ screen: "page", slug: "usage-v2" });
		const sessions = await executeTool(
			"show",
			{ screen: "sessions", workspace: "dashboard" },
			ctx,
		);
		expect(sessions.ui?.navigate).toEqual({
			screen: "sessions",
			workspaceId: "ws-dash",
		});
	});

	test("end_session asks the session to end", async () => {
		const { ctx, endRequests } = context(fakeData());
		const result = await executeTool("end_session", {}, ctx);
		expect(result.output).toEqual({ ending: true });
		expect(endRequests()).toBe(1);
	});

	test("bad arguments and unknown tools answer with an error", async () => {
		const { ctx } = context(fakeData());
		const bad = await executeTool("read_session", { maxChars: 10 }, ctx);
		expect((bad.output as { error: { kind: string } }).error.kind).toBe(
			"invalid_arguments",
		);
		const unknown = await executeTool("delete_everything", {}, ctx);
		expect((unknown.output as { error: { kind: string } }).error.kind).toBe(
			"unknown_tool",
		);
	});

	test("a call that never answers fails as a timeout, not a hang", async () => {
		const realSetTimeout = globalThis.setTimeout;
		globalThis.setTimeout = ((fn: () => void) =>
			realSetTimeout(fn, 0)) as typeof setTimeout;
		try {
			const { ctx } = context(
				fakeData({ listWorkspaces: () => new Promise(() => {}) }),
			);
			const result = await executeTool("list_workspaces", {}, ctx);
			expect(result.output).toMatchObject({ error: { kind: "timeout" } });
		} finally {
			globalThis.setTimeout = realSetTimeout;
		}
	});

	test("a write that never answers is outcome unknown, never a plain failure", async () => {
		const realSetTimeout = globalThis.setTimeout;
		globalThis.setTimeout = ((fn: () => void) =>
			realSetTimeout(fn, 0)) as typeof setTimeout;
		try {
			const { ctx } = context(
				fakeData({ sendMessage: () => new Promise(() => {}) }),
			);
			const result = await executeTool(
				"send_message",
				{ workspace: "auth", text: "go" },
				ctx,
			);
			expect(result.output).toMatchObject({
				error: { kind: "outcome_unknown" },
			});
		} finally {
			globalThis.setTimeout = realSetTimeout;
		}
	});
});
